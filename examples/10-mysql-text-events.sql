SELECT s.session_id, e.event_type, COUNT(*)
FROM sessions s
JOIN events e ON e.session_id = s.id
WHERE e.event_type = 'click'
GROUP BY s.session_id, e.event_type
ORDER BY s.session_id;
