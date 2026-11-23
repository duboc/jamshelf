import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { EnergyState } from './energy';

const FOCUSABLE_SELECTOR =
  'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

const INTERACTIVE_SELECTOR =
  'input:not(:disabled), textarea:not(:disabled), select:not(:disabled), button:not(:disabled), a[href]';

const modalStack: symbol[] = [];

export function trapFocusKey(e: KeyboardEvent, root: HTMLElement | null) {
  if (e.key !== 'Tab' || !root) return;
  const focusables = [...root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (el) => el.offsetParent !== null && !el.closest('[inert]')
  );
  if (focusables.length === 0) {
    e.preventDefault();
    root.focus({ preventScroll: true });
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (e.shiftKey) {
    if (!active || active === first || active === root || !root.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else if (!active || active === last || !root.contains(active)) {
    e.preventDefault();
    first.focus();
  }
}

export function useModalA11y(
  open: boolean,
  rootRef: { current: HTMLElement | null },
  onClose: () => void
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const modalId = Symbol('stage-modal');
    const prev = document.activeElement as HTMLElement | null;
    const appRoot = document.getElementById('root');

    modalStack.push(modalId);
    if (modalStack.length === 1) {
      appRoot?.setAttribute('inert', '');
      appRoot?.setAttribute('aria-hidden', 'true');
    }

    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) {
      const region = root.querySelector<HTMLElement>('[role="region"]');
      const searchScope = region ?? root;
      const firstInBody = [
        ...searchScope.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR),
      ].find((el) => el.offsetParent !== null && !el.closest('[inert]'));
      if (firstInBody) {
        firstInBody.focus({ preventScroll: true });
      } else if (region) {
        region.focus({ preventScroll: true });
      } else {
        root.focus({ preventScroll: true });
      }
    }

    const onKey = (e: KeyboardEvent) => {
      if (modalStack[modalStack.length - 1] !== modalId) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      trapFocusKey(e, rootRef.current);
    };
    document.addEventListener('keydown', onKey, true);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      const idx = modalStack.lastIndexOf(modalId);
      if (idx >= 0) modalStack.splice(idx, 1);
      if (modalStack.length === 0) {
        appRoot?.removeAttribute('inert');
        appRoot?.removeAttribute('aria-hidden');
      }
      const active = document.activeElement as HTMLElement | null;
      const closingRoot = rootRef.current;
      const shouldRestore =
        !active ||
        active === document.body ||
        (closingRoot != null && closingRoot.contains(active));
      if (shouldRestore && prev && prev.isConnected && !prev.closest('[inert]')) {
        prev.focus({ preventScroll: true });
      }
    };
  }, [open, rootRef]);
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through for plain HTTP dev URLs.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('aria-hidden', 'true');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

export function UiIcon({
  name,
  size = 22,
  filled = false,
  className = '',
}: {
  name: string;
  size?: number;
  filled?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`ui-icon ${className}`.trim()}
      data-filled={filled ? 'true' : undefined}
      style={{ '--ui-icon-size': `${Math.max(20, size)}px` } as CSSProperties}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}

/**
 * Jamshelf emblem: two overlapping rounded sheets with a treble-inspired
 * double note silhouette.
 */
export function JamshelfBrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 192 192"
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <rect x="20" y="28" width="112" height="136" rx="28" fill="var(--ui-primary)" />
      <rect x="64" y="48" width="108" height="116" rx="28" fill="var(--ui-glow-secondary)" fillOpacity="0.88" />
      <path
        d="M114 78v44.5a15.5 15.5 0 1 1-12-15.1V82l36-8v38.5a15.5 15.5 0 1 1-12-15.1V80.5l-12 2.7V78Z"
        fill="#ffffff"
      />
    </svg>
  );
}

export type ButtonColor = 'filled' | 'tonal' | 'primary-tonal' | 'outlined' | 'text' | 'danger';

export function AuroraButton({
  color = 'outlined',
  icon,
  iconFilled = false,
  trailingIcon,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  color?: ButtonColor;
  icon?: string;
  iconFilled?: boolean;
  trailingIcon?: string;
}) {
  return (
    <button
      type={type}
      className={`stage-btn stage-btn-${color} typescale-label-lg ${className}`.trim()}
      {...rest}
    >
      {icon && <UiIcon name={icon} size={20} filled={iconFilled} />}
      <span>{children}</span>
      {trailingIcon && <UiIcon name={trailingIcon} size={20} />}
    </button>
  );
}

function useFillPop(filled: boolean, enabled: boolean): number {
  const [tracker, setTracker] = useState({ prev: filled, popKey: 0 });
  if (tracker.prev !== filled) {
    setTracker({
      prev: filled,
      popKey: enabled && filled && !tracker.prev ? tracker.popKey + 1 : tracker.popKey,
    });
  }
  return tracker.popKey;
}

export function AuroraIconButton({
  icon,
  label,
  filled = false,
  popOnFill,
  variant = 'standard',
  className = '',
  type = 'button',
  ...rest
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  icon: string;
  label: string;
  filled?: boolean;
  popOnFill?: boolean;
  variant?: 'standard' | 'tonal' | 'filled' | 'outlined';
}) {
  const shouldPop = popOnFill ?? (icon === 'favorite' || icon === 'star');
  const popKey = useFillPop(filled, shouldPop);

  return (
    <button
      type={type}
      aria-label={label}
      title={rest.title ?? label}
      data-variant={variant}
      className={`stage-icon-btn ${className}`.trim()}
      {...rest}
    >
      <UiIcon
        key={popKey > 0 ? `pop-${popKey}` : 'rest'}
        name={icon}
        size={22}
        filled={filled}
        className={popKey > 0 && filled ? 'icon-pop-in' : ''}
      />
    </button>
  );
}

export function AuroraChip({
  selected = false,
  icon,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
  icon?: string;
}) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      data-selected={selected ? 'true' : undefined}
      className={`stage-chip typescale-label-lg ${className}`.trim()}
      {...rest}
    >
      {icon && <UiIcon name={icon} size={20} filled={selected} />}
      <span>{children}</span>
    </button>
  );
}

export function AuroraSegmented<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  className = '',
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string; shortLabel?: string; icon?: string }[];
  ariaLabel: string;
  className?: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const btnRefs = useRef<Map<T, HTMLButtonElement>>(new Map());
  const readyRef = useRef(false);
  const [pillReady, setPillReady] = useState(false);

  const syncIndicator = useCallback(
    (animate: boolean) => {
      const container = groupRef.current;
      const indicator = indicatorRef.current;
      const activeBtn = btnRefs.current.get(value);
      if (!container || !indicator || !activeBtn) return;

      const nextLeft = activeBtn.offsetLeft;
      const nextTop = activeBtn.offsetTop;
      const nextWidth = activeBtn.offsetWidth;
      const nextHeight = activeBtn.offsetHeight;
      if (nextWidth <= 0 || nextHeight <= 0) return;

      const reduced =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      let prevLeft = nextLeft;
      let prevWidth = nextWidth;
      if (animate && readyRef.current && !reduced) {
        const cRect = container.getBoundingClientRect();
        const iRect = indicator.getBoundingClientRect();
        const scaleX = container.offsetWidth > 0 ? cRect.width / container.offsetWidth : 1;
        if (iRect.width > 0 && scaleX > 0.01) {
          prevLeft = (iRect.left - cRect.left) / scaleX - container.clientLeft;
          prevWidth = iRect.width / scaleX;
        }
      }

      indicator.style.transition = 'none';
      indicator.style.left = `${nextLeft}px`;
      indicator.style.top = `${nextTop}px`;
      indicator.style.width = `${nextWidth}px`;
      indicator.style.height = `${nextHeight}px`;

      if (
        animate &&
        readyRef.current &&
        !reduced &&
        (Math.abs(prevLeft - nextLeft) > 0.5 || Math.abs(prevWidth - nextWidth) > 0.5)
      ) {
        const dx = prevLeft - nextLeft;
        const sx = prevWidth / nextWidth;
        indicator.style.transform = `translate3d(${dx}px, 0, 0) scaleX(${sx})`;
        void indicator.offsetWidth;
        indicator.style.transition = '';
        indicator.style.transform = 'translate3d(0, 0, 0) scaleX(1)';
      } else {
        indicator.style.transform = 'translate3d(0, 0, 0) scaleX(1)';
        void indicator.offsetWidth;
        indicator.style.transition = '';
      }

      if (!readyRef.current) {
        readyRef.current = true;
        setPillReady(true);
      }
    },
    [value]
  );

  useLayoutEffect(() => {
    syncIndicator(true);
  }, [syncIndicator, options.length]);

  useEffect(() => {
    const container = groupRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => syncIndicator(false));
    ro.observe(container);
    let cancelled = false;
    void document.fonts?.ready.then(() => {
      if (!cancelled) syncIndicator(false);
    });
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [syncIndicator]);

  return (
    <div
      ref={groupRef}
      role="group"
      aria-label={ariaLabel}
      data-pill-ready={pillReady ? 'true' : undefined}
      className={`stage-segmented ${className}`.trim()}
    >
      <span ref={indicatorRef} aria-hidden="true" className="stage-segmented-indicator" />
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              if (el) btnRefs.current.set(opt.value, el);
              else btnRefs.current.delete(opt.value);
            }}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className="stage-segmented-btn typescale-label-lg"
          >
            {opt.icon && <UiIcon name={opt.icon} size={20} filled={active} />}
            {opt.shortLabel ? (
              <>
                <span className="sm:hidden">{opt.shortLabel}</span>
                <span className="hidden sm:inline">{opt.label}</span>
              </>
            ) : (
              <span>{opt.label}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const ENERGY_STATE_PT: Record<EnergyState, string> = {
  idle: 'Pronto',
  anticipating: 'Preparando',
  receiving: 'Ouvindo',
  processing: 'Processando',
  responding: 'Concluindo',
};

function ActiveSpinnerIcon({ className = '' }: { className?: string }) {
  const iconWrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = iconWrapRef.current;
    if (!el || typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let deg = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (!document.hidden) {
        const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
        deg = (deg + dt * 270) % 360;
        el.style.transform = `rotate(${deg}deg)`;
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <span ref={iconWrapRef} className={`inline-flex leading-none ${className}`.trim()}>
      <UiIcon name="progress_activity" size={20} />
    </span>
  );
}

export function AuroraProcessingIndicator({
  state,
  label,
}: {
  state: EnergyState;
  label: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="stage-toast inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-surface-container-high text-on-surface"
    >
      <UiIcon
        name="auto_awesome"
        size={20}
        filled={state === 'processing' || state === 'responding'}
        className="text-primary"
      />
      <span className="typescale-label-sm">{label}</span>
      <span key={state} className="chord-settle typescale-body-sm text-on-surface-variant">
        {ENERGY_STATE_PT[state]}
      </span>
    </div>
  );
}

export function AuroraCollapsible({
  open,
  id,
  className = '',
  children,
}: {
  open: boolean;
  id?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      data-open={open ? 'true' : undefined}
      className={`tx-expand ${className}`.trim()}
    >
      <div className="tx-expand-inner" inert={!open} aria-hidden={!open}>
        {children}
      </div>
    </div>
  );
}

export interface ThinkingStepItem {
  title: string;
  detail: string;
  done: boolean;
}

export function AuroraThinkingSteps({
  steps,
  summary = 'Mostrar raciocínio',
  defaultExpanded = false,
}: {
  steps: ThinkingStepItem[];
  summary?: string;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = useId();

  return (
    <div className="rounded-2xl bg-surface-container overflow-hidden">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((v) => !v)}
        className="w-full min-h-[48px] px-4 py-2.5 flex items-center justify-between gap-3 text-left text-on-surface hover:bg-surface-container-high cursor-pointer border-none bg-transparent transition-colors"
      >
        <span className="inline-flex items-center gap-2 typescale-label-lg text-on-surface-variant">
          <UiIcon name="auto_awesome" size={20} className="text-primary" />
          <span>{summary}</span>
        </span>
        <UiIcon
          name="expand_more"
          size={22}
          className={`text-on-surface-variant tx-chevron ${expanded ? 'tx-chevron-open' : ''}`.trim()}
        />
      </button>
      <AuroraCollapsible open={expanded} id={contentId}>
        <div className="px-4 pb-4 pt-1">
          <ul role="list" className="m-0 p-0 list-none space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} role="listitem" className="flex items-start gap-2.5">
                {step.done ? (
                  <UiIcon
                    key="done"
                    name="check_circle"
                    size={20}
                    filled
                    className="icon-pop-in text-tertiary mt-0.5"
                  />
                ) : (
                  <ActiveSpinnerIcon key="busy" className="text-primary mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="typescale-label-lg text-on-surface">{step.title}</div>
                  <div className="typescale-body-sm text-on-surface-variant">{step.detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </AuroraCollapsible>
    </div>
  );
}

export function AuroraSuggestionGroup({
  items,
  onSelect,
  ariaLabel = 'Sugestões rápidas',
}: {
  items: { label: string; prompt: string; icon?: string }[];
  onSelect: (prompt: string) => void;
  ariaLabel?: string;
}) {
  const shown = items.slice(0, 3);
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-2">
      {shown.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => onSelect(item.prompt)}
          className="suggestion-pill typescale-label-lg"
        >
          {item.icon && <UiIcon name={item.icon} size={20} className="text-primary" />}
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

export function AuroraDialog({
  open,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-2xl',
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, dialogRef, onClose);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 stage-scrim flex items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`stage-dialog focus:outline-none w-full ${maxWidth} max-h-[90dvh] flex flex-col overflow-hidden`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5 pb-3 border-b border-outline-variant/60">
          <div className="min-w-0">
            <h2 id={titleId} className="typescale-title-lg text-on-surface m-0">
              {title}
            </h2>
            {subtitle && (
              <p className="typescale-body-sm text-on-surface-variant mt-1 mb-0">{subtitle}</p>
            )}
          </div>
          <AuroraIconButton
            icon="close"
            label="Fechar janela"
            onClick={onClose}
            className="-mr-2.5 -mt-1.5"
          />
        </div>
        <div
          role="region"
          tabIndex={0}
          aria-label={title}
          className="stage-scroll bg-surface p-6 overflow-y-auto focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function AuroraSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, sheetRef, onClose);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 stage-scrim flex justify-end items-end md:items-stretch"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="stage-sheet focus:outline-none w-full md:max-w-md max-h-[86dvh] md:max-h-full bg-surface rounded-t-[28px] md:rounded-t-none md:rounded-l-[28px] flex flex-col overflow-hidden"
        style={{ boxShadow: 'var(--ui-elevation-overlay)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-outline-variant/60">
          <div className="min-w-0">
            <h2 id={titleId} className="typescale-title-lg text-on-surface m-0">
              {title}
            </h2>
            {subtitle && (
              <p className="typescale-body-sm text-on-surface-variant mt-0.5 mb-0">{subtitle}</p>
            )}
          </div>
          <AuroraIconButton
            icon="close"
            label="Fechar painel"
            onClick={onClose}
            className="-mr-2.5 -mt-1.5"
          />
        </div>
        <div
          role="region"
          tabIndex={0}
          aria-label={title}
          className="stage-scroll bg-surface p-6 overflow-y-auto flex-1 focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2"
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
