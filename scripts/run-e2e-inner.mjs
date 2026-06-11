import { spawn } from 'child_process';
import http from 'http';

const PORT = 3001;

function waitPort(port, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        // Next.js dev server will return some status
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error(`Timeout waiting for port ${port}`));
        } else {
          setTimeout(check, 500);
        }
      });
    };
    check();
  });
}

async function main() {
  console.log('Spawning Next.js dev server...');
  
  // Set env vars explicitly for development
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: 'development'
  };

  const devServer = spawn('npx', ['next', 'dev', '-p', String(PORT)], {
    stdio: 'inherit',
    env
  });

  try {
    console.log(`Waiting for Next.js to start on port ${PORT}...`);
    await waitPort(PORT);
    console.log('Next.js dev server is ready!');

    console.log('Running test-e2e.mjs...');
    const testProcess = spawn('node', ['scripts/test-e2e.mjs'], {
      stdio: 'inherit',
      env
    });

    const exitCode = await new Promise((resolve) => {
      testProcess.on('close', resolve);
    });

    console.log(`Test suite finished with code: ${exitCode}`);
    
    // Kill dev server
    devServer.kill('SIGTERM');
    process.exit(exitCode);
  } catch (err) {
    console.error('Error during E2E orchestrator execution:', err);
    devServer.kill('SIGTERM');
    process.exit(1);
  }
}

main();
