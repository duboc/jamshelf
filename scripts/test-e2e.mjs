const PORT = process.env.PORT || 3001;
const BASE_URL = `http://127.0.0.1:${PORT}`;

async function runTests() {
  console.log(`Starting E2E API tests against ${BASE_URL}...`);

  // 1. Test Song API
  const testSong = {
    id: 'song-test-e2e',
    text: '{title: Test E2E Song}\n{artist: E2E Tester}\n{key: C}\n\n[Verse 1]\n[C]Hello world'
  };

  console.log('Testing POST /api/songs...');
  const postRes = await fetch(`${BASE_URL}/api/songs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testSong),
  });
  if (!postRes.ok) throw new Error(`POST /api/songs failed: ${postRes.status}`);
  console.log('POST /api/songs OK');

  console.log('Testing GET /api/songs...');
  const getRes = await fetch(`${BASE_URL}/api/songs`);
  if (!getRes.ok) throw new Error(`GET /api/songs failed: ${getRes.status}`);
  const songs = await getRes.json();
  const found = songs.find(s => s.id === testSong.id);
  if (!found || found.text !== testSong.text) {
    throw new Error('E2E song not found or text mismatch in GET response');
  }
  console.log('GET /api/songs OK');

  console.log('Testing PUT /api/songs/[id]...');
  const updatedText = testSong.text + '\n[Chorus]\n[G]More chords';
  const putRes = await fetch(`${BASE_URL}/api/songs/${testSong.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: updatedText }),
  });
  if (!putRes.ok) throw new Error(`PUT /api/songs/[id] failed: ${putRes.status}`);
  console.log('PUT /api/songs/[id] OK');

  // Verify update
  const getRes2 = await fetch(`${BASE_URL}/api/songs`);
  const songs2 = await getRes2.json();
  const found2 = songs2.find(s => s.id === testSong.id);
  if (!found2 || found2.text !== updatedText) {
    throw new Error('Updated text mismatch in GET response');
  }
  console.log('Verification after PUT OK');

  // 2. Test Setlist API
  const testSetlist = {
    id: 'setlist-test-e2e',
    name: 'E2E Test Setlist',
    songIds: [testSong.id],
    createdAt: Date.now(),
  };

  console.log('Testing POST /api/setlists...');
  const postSetlistRes = await fetch(`${BASE_URL}/api/setlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testSetlist),
  });
  if (!postSetlistRes.ok) throw new Error(`POST /api/setlists failed: ${postSetlistRes.status}`);
  console.log('POST /api/setlists OK');

  console.log('Testing GET /api/setlists...');
  const getSetlistsRes = await fetch(`${BASE_URL}/api/setlists`);
  if (!getSetlistsRes.ok) throw new Error(`GET /api/setlists failed: ${getSetlistsRes.status}`);
  const setlists = await getSetlistsRes.json();
  const foundSetlist = setlists.find(s => s.id === testSetlist.id);
  if (!foundSetlist || foundSetlist.name !== testSetlist.name) {
    throw new Error('E2E setlist not found or name mismatch in GET response');
  }
  console.log('GET /api/setlists OK');

  console.log('Testing PUT /api/setlists/[id]...');
  const updatedName = 'Updated E2E Setlist';
  const putSetlistRes = await fetch(`${BASE_URL}/api/setlists/${testSetlist.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: updatedName, songIds: [] }),
  });
  if (!putSetlistRes.ok) throw new Error(`PUT /api/setlists/[id] failed: ${putSetlistRes.status}`);
  console.log('PUT /api/setlists/[id] OK');

  // Verify setlist update
  const getSetlistsRes2 = await fetch(`${BASE_URL}/api/setlists`);
  const setlists2 = await getSetlistsRes2.json();
  const foundSetlist2 = setlists2.find(s => s.id === testSetlist.id);
  if (!foundSetlist2 || foundSetlist2.name !== updatedName || foundSetlist2.songIds.length !== 0) {
    throw new Error('Updated setlist mismatch in GET response');
  }
  console.log('Verification after setlist PUT OK');

  // 3. Cleanup / DELETE
  console.log('Testing DELETE /api/songs/[id]...');
  const deleteRes = await fetch(`${BASE_URL}/api/songs/${testSong.id}`, {
    method: 'DELETE',
  });
  if (!deleteRes.ok) throw new Error(`DELETE /api/songs failed: ${deleteRes.status}`);
  console.log('DELETE /api/songs/[id] OK');

  console.log('Testing DELETE /api/setlists/[id]...');
  const deleteSetlistRes = await fetch(`${BASE_URL}/api/setlists/${testSetlist.id}`, {
    method: 'DELETE',
  });
  if (!deleteSetlistRes.ok) throw new Error(`DELETE /api/setlists failed: ${deleteSetlistRes.status}`);
  console.log('DELETE /api/setlists/[id] OK');

  // 3. Test Live Session API
  const sessionId = 'session-test-e2e';

  console.log('Testing GET /api/sessions/[id] (defaults for unseen id)...');
  const getDefaultRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
  if (!getDefaultRes.ok) throw new Error(`GET /api/sessions/[id] failed: ${getDefaultRes.status}`);
  const defaultSession = await getDefaultRes.json();
  if (defaultSession.leaderId !== null || defaultSession.bpm !== 120) {
    throw new Error('Expected default live session shape for unseen id');
  }
  console.log('GET /api/sessions/[id] defaults OK');

  console.log('Testing PUT /api/sessions/[id] (claim leadership)...');
  const claimRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      leaderId: 'device-a',
      leaderName: 'Alex',
      currentSongId: testSong.id,
      isAutoScrolling: true,
      autoScrollSpeed: 0.7,
      scrollTop: 120,
      metronomeOn: true,
      bpm: 96,
      updatedAt: Date.now(),
    }),
  });
  if (!claimRes.ok) throw new Error(`PUT /api/sessions/[id] claim failed: ${claimRes.status}`);
  const getAfterClaimRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
  const afterClaim = await getAfterClaimRes.json();
  if (afterClaim.leaderId !== 'device-a' || afterClaim.currentSongId !== testSong.id || afterClaim.bpm !== 96) {
    throw new Error('Live session claim mismatch in GET response');
  }
  console.log('PUT /api/sessions/[id] claim OK');

  console.log('Testing PUT /api/sessions/[id] (partial merge)...');
  const partialRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scrollTop: 340 }),
  });
  if (!partialRes.ok) throw new Error(`PUT /api/sessions/[id] partial failed: ${partialRes.status}`);
  const getAfterPartialRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
  const afterPartial = await getAfterPartialRes.json();
  if (afterPartial.scrollTop !== 340 || afterPartial.leaderId !== 'device-a' || afterPartial.bpm !== 96) {
    throw new Error('Live session partial merge did not preserve other fields');
  }
  console.log('PUT /api/sessions/[id] partial merge OK');

  console.log('Testing PUT /api/sessions/[id] (takeover, last-write-wins)...');
  const takeoverRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ leaderId: 'device-b', leaderName: 'Bea' }),
  });
  if (!takeoverRes.ok) throw new Error(`PUT /api/sessions/[id] takeover failed: ${takeoverRes.status}`);
  const getAfterTakeoverRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
  const afterTakeover = await getAfterTakeoverRes.json();
  if (afterTakeover.leaderId !== 'device-b' || afterTakeover.leaderName !== 'Bea') {
    throw new Error('Live session takeover did not win last-write');
  }
  console.log('PUT /api/sessions/[id] takeover OK');

  console.log('Testing DELETE /api/sessions/[id]...');
  const deleteSessionRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`, {
    method: 'DELETE',
  });
  if (!deleteSessionRes.ok) throw new Error(`DELETE /api/sessions/[id] failed: ${deleteSessionRes.status}`);
  const getAfterDeleteRes = await fetch(`${BASE_URL}/api/sessions/${sessionId}`);
  const afterDelete = await getAfterDeleteRes.json();
  if (afterDelete.leaderId !== null) {
    throw new Error('Live session did not reset to defaults after DELETE');
  }
  console.log('DELETE /api/sessions/[id] OK');

  // Cleanup: the session test also created testSong via the songs API above,
  // which was already deleted; nothing further to clean up here.

  // 4. Test Spotify Search API (graceful no-credentials path — no live secrets in CI)
  console.log('Testing GET /api/spotify/search (missing query)...');
  const spotifyNoQueryRes = await fetch(`${BASE_URL}/api/spotify/search`);
  if (spotifyNoQueryRes.status !== 400) {
    throw new Error(`Expected 400 for missing q param, got ${spotifyNoQueryRes.status}`);
  }
  console.log('GET /api/spotify/search missing query OK');

  console.log('Testing GET /api/spotify/search (soft-fail without/with credentials)...');
  const spotifySearchRes = await fetch(`${BASE_URL}/api/spotify/search?q=test`);
  if (!spotifySearchRes.ok) throw new Error(`GET /api/spotify/search failed: ${spotifySearchRes.status}`);
  const spotifyData = await spotifySearchRes.json();
  if (!Array.isArray(spotifyData.results)) {
    throw new Error('Expected /api/spotify/search to always return a results array');
  }
  console.log(`GET /api/spotify/search OK (results: ${spotifyData.results.length}${spotifyData.error ? ', not configured' : ''})`);

  console.log('E2E API Tests Completed Successfully!');
}

runTests().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
