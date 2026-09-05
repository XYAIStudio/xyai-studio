/**
 * V0.60 R1 WP-603 PEP (Policy Enforcement Point) 标准化断言函数
 *
 * 替换路由中内嵌的 WHERE tenant_id = ? 和角色判断模式，
 * 提供可复用的访问控制断言。
 */

import type { Request } from "express";
import { dbGet } from "../db";

// ============================================================
// 上下文类型
// ============================================================

export interface Principal {
  id: number;
  role: string;
  tenantId: number;
}

export interface ResourceContext {
  tenantId: number;
  ownerId?: number;
  resourceType?: string;
}

// ============================================================
// PEP 断言函数 —— 不符合时抛出，被中间件/路由捕获
// ============================================================

/**
 * 断言当前主体与资源属于同一租户。
 * 不符合时抛出 403（不是 404，避免租户存在性探测）。
 */
export function assertTenantScope(principal: Principal, resourceTenantId: number): void {
  if (principal.tenantId !== resourceTenantId) {
    const err: any = new Error("Access denied: cross-tenant access is not allowed");
    err.status = 403;
    err.code = "CROSS_TENANT";
    throw err;
  }
}

/**
 * 断言主体是资源的拥有者（或超级管理员）。
 */
export function assertOwner(principal: Principal, resource: ResourceContext): void {
  assertTenantScope(principal, resource.tenantId);
  const isAdmin = principal.role === "super_admin" || principal.role === "admin";
  const isOwner = resource.ownerId !== undefined && resource.ownerId === principal.id;
  if (!isAdmin && !isOwner) {
    const err: any = new Error("Access denied: not the resource owner or administrator");
    err.status = 403;
    err.code = "NOT_OWNER";
    throw err;
  }
}

/**
 * 断言主体拥有指定角色之一。
 */
export function assertHasRole(principal: Principal, allowedRoles: string[]): void {
  if (!allowedRoles.includes(principal.role)) {
    const err: any = new Error(`Access denied: requires one of [${allowedRoles.join(", ")}]`);
    err.status = 403;
    err.code = "INSUFFICIENT_ROLE";
    throw err;
  }
}

/**
 * 断言资源属于指定租户（用于读取/写入前检查）。
 * 返回资源本身，方便链式调用。
 */
export function assertResourceExists<T>(
  resource: T | undefined | null,
  principal: Principal,
  resourceTenantId: number
): T {
  if (!resource) {
    const err: any = new Error("Resource not found");
    err.status = 404;
    err.code = "NOT_FOUND";
    throw err;
  }
  assertTenantScope(principal, resourceTenantId);
  return resource;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 从 Express Request 提取 Principal（配合 AuthRequest 类型使用）
 */
export function principalFromRequest(req: Request): Principal {
  const user = (req as any).user;
  if (!user) {
    const err: any = new Error("Authentication required");
    err.status = 401;
    err.code = "UNAUTHORIZED";
    throw err;
  }
  return {
    id: user.id,
    role: user.role,
    tenantId: user.tenant_id,
  };
}

/**
 * 检查主体是否为管理员
 */
export function isAdmin(principal: Principal): boolean {
  return principal.role === "super_admin" || principal.role === "admin";
}
