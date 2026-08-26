/**
 * Integration Test Mock Utilities
 *
 * Use these utilities in integration tests (*.integration.test.ts) where you mock
 * at the service layer rather than the database layer.
 *
 * For unit tests, use supabase-mock.ts instead.
 */
import { mock } from "bun:test"

export type IntegrationChainableResult<T = unknown> = {
  data: T | null
  error: { message: string; code?: string } | null
}

type ChainMethod = ReturnType<typeof mock<() => IntegrationChainableMock>>

export interface IntegrationChainableMock {
  select: ChainMethod
  insert: ChainMethod
  update: ChainMethod
  delete: ChainMethod
  upsert: ChainMethod
  eq: ChainMethod
  neq: ChainMethod
  gt: ChainMethod
  gte: ChainMethod
  lt: ChainMethod
  lte: ChainMethod
  in: ChainMethod
  is: ChainMethod
  or: ChainMethod
  not: ChainMethod
  contains: ChainMethod
  order: ChainMethod
  limit: ChainMethod
  range: ChainMethod
  single: ChainMethod
  maybeSingle: ChainMethod
  then: <TResult>(resolve: (value: IntegrationChainableResult) => TResult) => TResult
}

export function createIntegrationChainableMock<T = unknown>(
  resolvedValue: IntegrationChainableResult<T>
): IntegrationChainableMock {
  const chain: IntegrationChainableMock = {
    select: mock(() => chain),
    insert: mock(() => chain),
    update: mock(() => chain),
    delete: mock(() => chain),
    upsert: mock(() => chain),
    eq: mock(() => chain),
    neq: mock(() => chain),
    gt: mock(() => chain),
    gte: mock(() => chain),
    lt: mock(() => chain),
    lte: mock(() => chain),
    in: mock(() => chain),
    is: mock(() => chain),
    or: mock(() => chain),
    not: mock(() => chain),
    contains: mock(() => chain),
    order: mock(() => chain),
    limit: mock(() => chain),
    range: mock(() => chain),
    single: mock(() => chain),
    maybeSingle: mock(() => chain),
    then: (resolve) => resolve(resolvedValue as IntegrationChainableResult),
  }
  return chain
}
