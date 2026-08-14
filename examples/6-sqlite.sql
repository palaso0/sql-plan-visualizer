SELECT c.name, COUNT(o.id)
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.status = 'active'
GROUP BY c.id
ORDER BY COUNT(o.id) DESC;
