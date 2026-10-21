import { foregroundBehavior, setViewingConversation, setViewingMatch, shouldPresentForegroundNotification } from '../notificationFocus';

describe('foreground notification suppression', () => {
  test('hides a message alert while that same chat is open', () => {
    const leave = setViewingConversation('conv-1');
    expect(shouldPresentForegroundNotification({ type: 'message', conversationId: 'conv-1' })).toBe(false);
    expect(foregroundBehavior({ type: 'message', conversationId: 'conv-1' })).toMatchObject({ shouldShowAlert: false, shouldShowBanner: false });
    leave();
    expect(shouldPresentForegroundNotification({ type: 'message', conversationId: 'conv-1' })).toBe(true);
  });

  test('still shows alerts for other chats and for matches', () => {
    const leave = setViewingConversation('conv-1');
    expect(shouldPresentForegroundNotification({ type: 'message', conversationId: 'conv-2' })).toBe(true);
    expect(shouldPresentForegroundNotification({ type: 'match', matchId: 'm-1' })).toBe(true);
    leave();
  });

  test('hides a match alert while on that match landing screen only', () => {
    const leave = setViewingMatch('m-1');
    expect(shouldPresentForegroundNotification({ type: 'match', matchId: 'm-1' })).toBe(false);
    expect(shouldPresentForegroundNotification({ type: 'match', matchId: 'm-2' })).toBe(true);
    leave();
    expect(shouldPresentForegroundNotification({ type: 'match', matchId: 'm-1' })).toBe(true);
  });

  test('a stale cleanup does not clear a newer focus', () => {
    const leaveOld = setViewingConversation('conv-1');
    const leaveNew = setViewingConversation('conv-2');
    leaveOld();
    expect(shouldPresentForegroundNotification({ type: 'message', conversationId: 'conv-2' })).toBe(false);
    leaveNew();
  });

  test('unknown payloads are shown', () => {
    expect(shouldPresentForegroundNotification(undefined)).toBe(true);
  });
});
