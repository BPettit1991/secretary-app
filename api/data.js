import { getAccessToken } from './auth.js';

async function getCalendarEvents(token) {
  const now = new Date();
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView` +
    `?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}` +
    `&$orderby=start/dateTime&$top=20` +
    `&$select=subject,start,end,location,isAllDay`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Calendar: ${data.error?.message}`);
  return (data.value || []).map(e => ({
    id: e.id,
    subject: e.subject,
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
    location: e.location?.displayName || null,
    isAllDay: e.isAllDay,
  }));
}

async function getTasks(token) {
  const listsRes = await fetch(
    'https://graph.microsoft.com/v1.0/me/todo/lists',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const lists = await listsRes.json();
  if (!listsRes.ok) throw new Error(`Task lists: ${lists.error?.message}`);

  const taskPromises = (lists.value || []).map(list =>
    fetch(
      `https://graph.microsoft.com/v1.0/me/todo/lists/${list.id}/tasks` +
      `?$filter=status ne 'completed'&$select=title,importance,status,dueDateTime&$top=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then(r => r.json())
      .then(d => (d.value || []).map(t => ({
        id: t.id,
        title: t.title,
        importance: t.importance,
        status: t.status,
        due: t.dueDateTime?.dateTime?.split('T')[0] || null,
        list: list.displayName,
      })))
  );

  const all = await Promise.all(taskPromises);
  return all.flat();
}

async function getStorage(token) {
  const res = await fetch(
    'https://graph.microsoft.com/v1.0/me/drive?$select=quota',
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Drive: ${data.error?.message}`);
  const q = data.quota || {};
  return {
    used: q.used || 0,
    total: q.total || 0,
    remaining: q.remaining || 0,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const { accessToken } = await getAccessToken(req);

    const [calendar, tasks, storage] = await Promise.all([
      getCalendarEvents(accessToken),
      getTasks(accessToken),
      getStorage(accessToken),
    ]);

    res.json({ calendar, tasks, storage, timestamp: new Date().toISOString() });
  } catch (err) {
    if (err.message === 'NOT_CONNECTED' || err.message === 'NOT_CONFIGURED') {
      return res.status(401).json({ error: err.message });
    }
    console.error('API error:', err.message);
    res.status(500).json({ error: err.message });
  }
}
