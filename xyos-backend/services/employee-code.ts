import { dbGet, dbAll, dbRun } from "../db";

// 部门英文码映射
const DEPT_CODE_MAP: Record<string, string> = {
  'CEO办公室': 'CEO',
  '技术部': 'TECH',
  '产品部': 'PRODUCT',
  '市场部': 'MARKET',
  '财务部': 'FINANCE',
  '人力资源部': 'HR',
  '销售部': 'SALES',
  '运营部': 'OPS',
  '设计部': 'DESIGN',
  '法务部': 'LEGAL',
};

// 生成租户码（2-8位大写字母）
export function generateTenantCode(name: string): string {
  const codeMap: Record<string, string> = {
    '雄元': 'XY',
    '测试': 'TEST',
    '演示': 'DEMO',
  };
  
  for (const [key, code] of Object.entries(codeMap)) {
    if (name.includes(key)) return code;
  }
  
  const letters = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length >= 2) return letters.substring(0, Math.min(4, letters.length));
  
  return 'T' + String(Date.now()).slice(-4);
}

// 生成PID：ACME-0001 或 XY-0001
export function generatePid(tenantCode: string): string {
  // 插入序列号记录
  const result = dbRun(
    "INSERT INTO pid_sequences (tenant_code, seq_type) VALUES (?, 'employee')",
    [tenantCode]
  );
  
  const seqId = result.lastInsertRowid;
  return `${tenantCode}-${String(seqId).padStart(4, '0')}`;
}

// 生成部门英文码
export function generateDeptCode(deptName: string): string {
  // 先查映射表
  if (DEPT_CODE_MAP[deptName]) {
    return DEPT_CODE_MAP[deptName];
  }
  
  // 提取英文字母
  const letters = deptName.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (letters.length >= 2) {
    return letters.substring(0, Math.min(8, letters.length));
  }
  
  // 兜底：DEPT + 编号
  const count = (dbGet("SELECT COUNT(*) as c FROM departments") as any)?.c || 0;
  return `DEPT${String(count + 1).padStart(3, '0')}`;
}

// 生成PCC：ACME-TECH-P0001
export function generatePcc(tenantCode: string, deptCode: string): string {
  // 获取该部门的岗位序号
  const count = (dbGet(
    "SELECT COUNT(*) as c FROM employee_positions WHERE pcc LIKE ?",
    [`${tenantCode}-${deptCode}-P%`]
  ) as any)?.c || 0;
  
  const pNum = count + 1;
  return `${tenantCode}-${deptCode}-P${String(pNum).padStart(4, '0')}`;
}

// 入职：分配PID + 主岗PCC
export function onboardEmployee(
  employeeId: number,
  tenantCode: string,
  deptId: number | null,
  deptName: string | null
): { pid: string; pcc: string } {
  const pid = generatePid(tenantCode);
  
  let pcc = `${tenantCode}-NIL-P0000`;
  let deptCode = 'NIL';
  
  if (deptId && deptName) {
    deptCode = generateDeptCode(deptName);
    pcc = generatePcc(tenantCode, deptCode);
  }
  
  // 更新员工PID
  dbRun("UPDATE employees SET pid = ? WHERE id = ?", [pid, employeeId]);
  
  // 插入岗位记录
  dbRun(
    `INSERT INTO employee_positions (employee_id, pid, pcc, dept_id, dept_code, is_primary, position_type, start_date)
     VALUES (?, ?, ?, ?, ?, 1, 'permanent', datetime('now'))`,
    [employeeId, pid, pcc, deptId, deptCode]
  );
  
  // 记录历史
  dbRun(
    `INSERT INTO position_history (employee_id, pid, old_pcc, new_pcc, change_type, new_dept_id, effective_at)
     VALUES (?, ?, NULL, ?, 'onboard', ?, datetime('now'))`,
    [employeeId, pid, pcc, deptId]
  );
  
  return { pid, pcc };
}

// 调岗：保留PID，变更PCC
export function transferEmployee(employeeId: number, newDeptId: number, newDeptName: string): void {
  const employee = dbGet("SELECT * FROM employees WHERE id = ?", [employeeId]) as any;
  if (!employee) throw new Error("员工不存在");
  
  const tenant = dbGet("SELECT * FROM tenants WHERE id = ?", [employee.tenant_id]) as any;
  const tenantCode = tenant?.tenant_code || 'XY';
  
  // 获取当前主岗
  const currentPos = dbGet(
    "SELECT * FROM employee_positions WHERE employee_id = ? AND is_primary = 1",
    [employeeId]
  ) as any;
  
  const oldPcc = currentPos?.pcc || '';
  const oldDeptId = currentPos?.dept_id;
  
  // 结束旧主岗
  if (currentPos) {
    dbRun(
      "UPDATE employee_positions SET is_primary = 0, end_date = datetime('now') WHERE id = ?",
      [currentPos.id]
    );
  }
  
  // 创建新主岗
  const deptCode = generateDeptCode(newDeptName);
  const newPcc = generatePcc(tenantCode, deptCode);
  
  dbRun(
    `INSERT INTO employee_positions (employee_id, pid, pcc, dept_id, dept_code, is_primary, position_type, start_date)
     VALUES (?, ?, ?, ?, ?, 1, 'permanent', datetime('now'))`,
    [employeeId, employee.pid, newPcc, newDeptId, deptCode]
  );
  
  // 记录历史
  dbRun(
    `INSERT INTO position_history (employee_id, pid, old_pcc, new_pcc, change_type, old_dept_id, new_dept_id, effective_at)
     VALUES (?, ?, ?, ?, 'transfer', ?, ?, datetime('now'))`,
    [employeeId, employee.pid, oldPcc, newPcc, oldDeptId, newDeptId]
  );
}

// 兼岗：新增PCC（is_primary=0）
export function addSecondPosition(employeeId: number, deptId: number, deptName: string): void {
  const employee = dbGet("SELECT * FROM employees WHERE id = ?", [employeeId]) as any;
  if (!employee) throw new Error("员工不存在");
  
  const tenant = dbGet("SELECT * FROM tenants WHERE id = ?", [employee.tenant_id]) as any;
  const tenantCode = tenant?.tenant_code || 'XY';
  
  const deptCode = generateDeptCode(deptName);
  const pcc = generatePcc(tenantCode, deptCode);
  
  dbRun(
    `INSERT INTO employee_positions (employee_id, pid, pcc, dept_id, dept_code, is_primary, position_type, start_date)
     VALUES (?, ?, ?, ?, ?, 0, 'secondary', datetime('now'))`,
    [employeeId, employee.pid, pcc, deptId, deptCode]
  );
}

// 离职/废除：标记status，记录历史
export function terminateEmployee(employeeId: number, terminateType: 'depart' | 'decommission'): void {
  const employee = dbGet("SELECT * FROM employees WHERE id = ?", [employeeId]) as any;
  if (!employee) throw new Error("员工不存在");
  
  // 更新员工状态
  const newStatus = terminateType === 'depart' ? 'inactive' : 'decommissioned';
  dbRun("UPDATE employees SET status = ? WHERE id = ?", [newStatus, employeeId]);
  
  // 结束所有岗位
  dbRun(
    "UPDATE employee_positions SET end_date = datetime('now') WHERE employee_id = ? AND end_date IS NULL",
    [employeeId]
  );
  
  // 记录历史
  const currentPos = dbGet(
    "SELECT * FROM employee_positions WHERE employee_id = ? AND is_primary = 1 ORDER BY id DESC LIMIT 1",
    [employeeId]
  ) as any;
  
  if (currentPos) {
    dbRun(
      `INSERT INTO position_history (employee_id, pid, old_pcc, new_pcc, change_type, effective_at)
       VALUES (?, ?, ?, 'NIL', ?, datetime('now'))`,
      [employeeId, employee.pid, currentPos.pcc, terminateType]
    );
  }
}

// 重新入职/激活：原PID激活，新PCC
export function reactivateEmployee(employeeId: number, deptId: number, deptName: string): void {
  const employee = dbGet("SELECT * FROM employees WHERE id = ?", [employeeId]) as any;
  if (!employee) throw new Error("员工不存在");
  
  // 激活员工
  dbRun("UPDATE employees SET status = 'active' WHERE id = ?", [employeeId]);
  
  // 创建新主岗
  const tenant = dbGet("SELECT * FROM tenants WHERE id = ?", [employee.tenant_id]) as any;
  const tenantCode = tenant?.tenant_code || 'XY';
  
  const deptCode = generateDeptCode(deptName);
  const pcc = generatePcc(tenantCode, deptCode);
  
  dbRun(
    `INSERT INTO employee_positions (employee_id, pid, pcc, dept_id, dept_code, is_primary, position_type, start_date)
     VALUES (?, ?, ?, ?, ?, 1, 'permanent', datetime('now'))`,
    [employeeId, employee.pid, pcc, deptId, deptCode]
  );
  
  // 记录历史
  dbRun(
    `INSERT INTO position_history (employee_id, pid, old_pcc, new_pcc, change_type, new_dept_id, effective_at)
     VALUES (?, ?, 'NIL', ?, 'rehire', ?, datetime('now'))`,
    [employeeId, employee.pid, pcc, deptId]
  );
}

// 查询员工编码和岗位
export function getEmployeeCode(employeeId: number): { pid: string; positions: any[] } {
  const employee = dbGet("SELECT id, pid FROM employees WHERE id = ?", [employeeId]) as any;
  if (!employee) throw new Error("员工不存在");
  
  const positions = dbAll(
    `SELECT ep.*, d.name as dept_name
     FROM employee_positions ep
     LEFT JOIN departments d ON ep.dept_id = d.id
     WHERE ep.employee_id = ?
     ORDER BY ep.is_primary DESC, ep.start_date DESC`,
    [employeeId]
  );
  
  return { pid: employee.pid || '未分配', positions };
}
