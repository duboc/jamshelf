import type { Song } from '@/lib/types/song';

export const DEFAULT_SONGS: Song[] = [{
  id:"adore-you",title:"Adore You",artist:"Harry Styles",
  originalKey:"Cm",capo:3,displayKey:"Am",tempo:99,timeSignature:"4/4",
  sections:[
    {type:"intro",label:"Intro",lines:["[Bm7]   [D]","[Gmaj7]    [A]"]},
    {type:"verse",label:"Verse 1",lines:[
      "[Bm7]Walk in your [D]rainbow paradise [Gmaj7](Paradise)[A]",
      "[Bm7]Strawberry [D]lipstick state of [Gmaj7]mind (State of [A]mind)",
      "[Bm7]I get so [D]lost inside your [Gmaj7]eyes",
      "Would you be[A]lieve it?"]},
    {type:"pre-chorus",label:"Pre-Chorus",lines:[
      "[Bm7]You don't have to say you love me",
      "[D]You don't have to say nothing",
      "[Gmaj7]You don't have to say you're [A]mine"]},
    {type:"chorus",label:"Chorus",lines:[
      "Ho[Bm7]ney [D](Ah-ah-ah)",
      "I'd walk through [Gmaj7]fire for you",
      "Just let me a[A]dore you",
      "Oh, ho[Bm7]ney [D](Ah-ah-ah)",
      "I'd walk through [Gmaj7]fire for you",
      "Just let me adore you",
      "Like it's the [A]only thing I'll [Bm7]ever do[D]",
      "Like it's the only thing I'll [Gmaj7]ever do[A]"]},
    {type:"verse",label:"Verse 2",lines:[
      "[Bm7]Your wonder [D]under summer [Gmaj7]skies[A]",
      "[Bm7]Brown skin and [D]lemon over [Gmaj7]ice",
      "Would you be[A]lieve it?"]},
    {type:"pre-chorus",label:"Pre-Chorus",lines:[
      "[Bm7]You don't have to say you love me",
      "[D]I just wanna tell you somethin'",
      "[Gmaj7]Lately you've been on my [A]mind"]},
    {type:"chorus",label:"Chorus",lines:[
      "Ho[Bm7]ney [D](Ah-ah-ah)",
      "I'd walk through [Gmaj7]fire for you",
      "Just let me a[A]dore you",
      "Oh, ho[Bm7]ney [D](Ah-ah-ah)",
      "I'd walk through [Gmaj7]fire for you",
      "Just let me adore you",
      "Like it's the [A]only thing I'll [Bm7]ever do[D]",
      "Like it's the only thing I'll [Gmaj7]ever do[A]"]},
    {type:"bridge",label:"Bridge",lines:[
      "It's the [Bm7]only thing I'll ever do",
      "It's the [D]only thing I'll ever do",
      "It's the [Gmaj7]only thing I'll ever do",
      "It's the only thing I'll [A]ever do",
      "It's the [Bm7]only thing I'll ever do",
      "It's the [D]only thing I'll ever do",
      "It's the [Gmaj7]only thing I'll ever do",
      "It's the only thing I'll [A]ever do"]},
    {type:"chorus",label:"Final Chorus",lines:[
      "[Bm7](Ahhh)[D]",
      "I'd walk through [Gmaj7]fire for you",
      "Just let me a[A]dore you",
      "Oh, ho[Bm7]ney [D](Ah-ah-ah)",
      "I'd walk through [Gmaj7]fire for you",
      "Just let me adore you",
      "Like it's the only thing I'll [Bm7]ever do",
      "(It's the only thing I'll ever do, It's the [D]only thing I'll ever do)",
      "I'd walk through [Gmaj7]fire for you (It's the only thing I'll ever do)",
      "Just let me a[A]dore you","",
      "Oh, honey (Ah-ah-ah), oh, honey",
      "(It's the [Bm7]only thing I'll ever do, It's the [D]only thing I'll ever do)",
      "I'd walk through [Gmaj7]fire for you (It's the only thing I'll ever do)",
      "Just let me a[A]dore you (It's the only thing I'll ever do)"]},
    {type:"outro",label:"Outro",lines:[
      "[Bm7]Ooh, ooh","[D]Ooh, honey","Ooh, ooh",
      "[Gmaj7]Just let me adore you",
      "Like it's the only thing I'll ever do"]}]
}];
