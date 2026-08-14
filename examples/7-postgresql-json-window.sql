SELECT d.name, e.employee_id, e.salary,
       ROW_NUMBER() OVER (PARTITION BY d.name ORDER BY e.salary DESC) AS rn
FROM departments d
JOIN employees e ON e.department_id = d.id
WHERE e.status = 'active';
