import test from 'node:test';
import assert from 'node:assert/strict';
import { multiplayerRoomManager } from './roomManager';

test('MultiplayerRoomManager creates valid shareable 6-digit room code', () => {
  const code = multiplayerRoomManager.createPrivateRoom();
  assert.equal(code.startsWith('KNT-'), true);
  assert.equal(code.length, 8); // 'KNT-XXXX'
  assert.equal(multiplayerRoomManager.getCurrentRoomCode(), code);
  assert.equal(multiplayerRoomManager.getIsHost(), true);
  assert.equal(multiplayerRoomManager.getConnectionState(), 'WAITING_FOR_PEER');
  multiplayerRoomManager.leaveRoom();
});

test('MultiplayerRoomManager enters waiting queue without immediately generating fake matches', () => {
  multiplayerRoomManager.enterQuickMatchQueue();
  assert.equal(multiplayerRoomManager.getCurrentRoomCode(), 'GLOBAL_QUICK_QUEUE');
  assert.equal(multiplayerRoomManager.getConnectionState(), 'WAITING_FOR_PEER');
  assert.equal(multiplayerRoomManager.getRemotePeer(), null); // NO fake auto-bot!
  multiplayerRoomManager.leaveRoom();
});
