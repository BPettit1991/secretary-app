import { getAccessToken } from './auth.js';

async function getCalendarEvents(token) {
  const now = new Date();
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/calendarView` +
    `?startDateTime=${now.toISOString()}&endDateTime=${end.toISOString()}` +
    `&$orderby=start/dateTime&$top=20` +
    `&$select=subject,start,end,location,isAllDay,bodyPreview`,
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
  if (!listsRes.ok) throw new Error(`Tasks lists: ${lists.error?.message}`);

  const taskPromises = (lists.value || []).map(list =>
    fetch(
      `https://graph.microsoft.com/v1.0/me/todo/lists/${list.id}/tasks` +
      `?$filter=status ne 'completed'` +
      `&$select=title,importance,status,dueDateTime,categories&$top=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
      .then(r => r.json())
      .then(d => (d.value || []).map(t => ({
        id: t.id,
        title: t.title,
        importance: t.importance, // 'high' | 'normal' | 'low'
        status: t.status,
        due: t.dueDateTime?.dateTime?.split('T')[0] || null,
        categories: t.categories || [],
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
  res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');

  try {
    const token = await getAccessToken();
    const [calendar, tasks, storage] = await Promise.all([
      getCalendarEvents(token),
      getTasks(token),
      getStorage(token),
    ]);

    res.json({
      calendar,
      tasks,
      storage,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('API error:', err.message);
    // Return 200 with error detail so it's debuggable
    res.status(200).json({ error: err.message, stack: err.stack?.split('\n').slice(0,3) });
  }
}
