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

  console.log('E2E API Tests Completed Successfully!');
}

runTests().catch(err => {
  console.error('E2E Test Failed:', err);
  process.exit(1);
});
