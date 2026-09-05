-- V0.60 R1 WP-602 通用组织节点表
-- 将 departments 扩展为 organization_units，支持多类型组织节点：
--   company, department, project_team, temporary_group, matrix_dimension

CREATE TABLE IF NOT EXISTS organization_units (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'department',
  name TEXT NOT NULL,
  code TEXT,
  parent_id INTEGER REFERENCES organization_units(id),
  tenant_id INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  metadata_json TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 数据迁移：将现有 departments 导入 organization_units
INSERT OR IGNORE INTO organization_units (id, type, name, code, parent_id, tenant_id, sort_order)
  SELECT id, 'department', name, department_code, parent_id, tenant_id, sort_order
  FROM departments WHERE id NOT IN (SELECT id FROM organization_units);

-- 员工-组织多对多关系表（用于矩阵组织）
CREATE TABLE IF NOT EXISTS employee_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  org_unit_id INTEGER NOT NULL REFERENCES organization_units(id),
  is_primary INTEGER DEFAULT 0,
  start_date DATE,
  end_date DATE,
  assignment_type TEXT DEFAULT 'member',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_id, org_unit_id, assignment_type)
);

-- 将现有 employees.department_id 迁移为 primary assignment
INSERT OR IGNORE INTO employee_assignments (employee_id, org_unit_id, is_primary, assignment_type)
  SELECT id, department_id, 1, 'member'
  FROM employees
  WHERE department_id IS NOT NULL
    AND (employee_id, department_id, 'member') NOT IN (SELECT employee_id, org_unit_id, assignment_type FROM employee_assignments);
