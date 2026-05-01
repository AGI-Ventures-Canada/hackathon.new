/**
 * Supabase Mock Utilities
 *
 * ## Mock Patterns
 *
 * ### Unit Tests (services, lib)
 * Use closure-based mocks via `setMockFromImplementation` and `setMockRpcImplementation`.
 * These work with the preloaded `mock.module("@/lib/db/client")` and allow per-test customization.
 *
 * ```typescript
 * import { createChainableMock, resetSupabaseMocks, setMockFromImplementation } from "../lib/supabase-mock"
 *
 * beforeEach(() => resetSupabaseMocks())
 *
 * it("example", async () => {
 *   setMockFromImplementation(() => createChainableMock({ data: {...}, error: null }))
 *   const result = await myServiceFunction()
 * })
 * ```
 *
 * ### Integration Tests (*.integration.test.ts)
 * Use `mock.module` at the service layer to mock entire services. This avoids
 * database layer complexity and tests route handlers in isolation.
 *
 * ```typescript
 * import { mock } from "bun:test"
 *
 * const mockListItems = mock(() => Promise.resolve([]))
 * mock.module("@/lib/services/items", () => ({ listItems: mockListItems }))
 *
 * const { itemRoutes } = await import("@/lib/api/routes/items")
 * ```
 *
 * ### Email Tests (*.email.test.ts)
 * Use `mock.module` for email services. These are separated because they mock
 * different modules and can conflict with integration test mocks.
 *
 * ## Why Separate Test Commands?
 * Bun's `mock.module` persists across tests in the same run. Integration tests
 * mock at the service layer while unit tests mock at the database layer - running
 * them together causes mock isolation failures.
 */
import { mock } from "bun:test"
import { MissingSupabaseCredentialsError } from "@/lib/db/client"

export { MissingSupabaseCredentialsError }

export const mockAuth = mock(() =>
  Promise.resolve({ userId: null, orgId: null, orgRole: null })
)
export const mockClerkClient = mock(() =>
  Promise.resolve({
    organizations: {
      getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
    },
  })
)

mock.module("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}))

export type ChainableResult<T = unknown> = {
  data: T | null
  error: { message: string; code?: string } | null
  count?: number | null
}

type ChainMethod = ReturnType<typeof mock<() => ChainableMock>>

export interface ChainableMock {
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
  ilike: ChainMethod
  contains: ChainMethod
  order: ChainMethod
  limit: ChainMethod
  range: ChainMethod
  single: ChainMethod
  maybeSingle: ChainMethod
  then: <TResult>(resolve: (value: ChainableResult) => TResult) => TResult
}

let currentFromImpl: (table: string) => ChainableMock = () => createChainableMock({ data: null, error: null })
let currentRpcImpl: (fn: string, params: unknown) => Promise<ChainableResult> = () =>
  Promise.resolve({ data: null, error: null })
type SupabaseMockClient = {
  from: (table: string) => ChainableMock
  rpc: (fn: string, params: unknown) => Promise<ChainableResult>
}

let currentSupabaseImpl: () => SupabaseMockClient = () => ({
  from: (table: string) => mockFrom(table),
  rpc: (fn: string, params: unknown) => mockRpc(fn, params),
})

export const mockFrom = mock((table: string) => currentFromImpl(table))
export const mockRpc = mock((fn: string, params: unknown) => currentRpcImpl(fn, params))
export const mockSupabase = mock(() => currentSupabaseImpl())

export function setMockFromImplementation(impl: (table: string) => ChainableMock) {
  currentFromImpl = impl
}

export function setMockRpcImplementation(
  impl: (fn: string, params: unknown) => Promise<ChainableResult>
) {
  currentRpcImpl = impl
}

export function setMockSupabaseImplementation(impl: () => SupabaseMockClient) {
  currentSupabaseImpl = impl
}

export function createChainableMock<T = unknown>(resolvedValue: ChainableResult<T>): ChainableMock {
  const chain: ChainableMock = {
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
    ilike: mock(() => chain),
    contains: mock(() => chain),
    order: mock(() => chain),
    limit: mock(() => chain),
    range: mock(() => chain),
    single: mock(() => chain),
    maybeSingle: mock(() => chain),
    then: (resolve) => resolve(resolvedValue as ChainableResult),
  }
  return chain
}

export function resetSupabaseMocks() {
  mockFrom.mockClear()
  mockRpc.mockClear()
  mockSupabase.mockClear()
  currentFromImpl = () => createChainableMock({ data: null, error: null })
  currentRpcImpl = () => Promise.resolve({ data: null, error: null })
  currentSupabaseImpl = () => ({
    from: (table: string) => mockFrom(table),
    rpc: (fn: string, params: unknown) => mockRpc(fn, params),
  })
}

/**
 * Test Utilities - Common mock patterns for reducing boilerplate
 */

export function mockTableQuery<T>(
  table: string,
  result: ChainableResult<T>,
  fallback: ChainableResult = { data: null, error: null }
): void {
  setMockFromImplementation((t) =>
    t === table
      ? createChainableMock(result)
      : createChainableMock(fallback)
  )
}

export function mockMultiTableQuery(
  handlers: Record<string, ChainableResult>,
  fallback: ChainableResult = { data: null, error: null }
): void {
  setMockFromImplementation((table) =>
    handlers[table]
      ? createChainableMock(handlers[table])
      : createChainableMock(fallback)
  )
}

export function mockRpcCall<T>(
  fnName: string,
  result: ChainableResult<T>
): void {
  setMockRpcImplementation((fn) =>
    fn === fnName
      ? Promise.resolve(result as ChainableResult)
      : Promise.resolve({ data: null, error: null })
  )
}

export function mockSuccess<T>(data: T): ChainableResult<T> {
  return { data, error: null }
}

export function mockError(message: string, code?: string): ChainableResult<null> {
  return { data: null, error: { message, code } }
}

export function mockCount(count: number): ChainableResult<null> {
  return { data: null, error: null, count }
}

export function resetClerkMocks() {
  mockAuth.mockClear()
  mockAuth.mockImplementation(() =>
    Promise.resolve({ userId: null, orgId: null, orgRole: null })
  )
  mockClerkClient.mockClear()
  mockClerkClient.mockImplementation(() =>
    Promise.resolve({
      organizations: {
        getOrganization: mock(() => Promise.resolve({ name: "Test Org" })),
      },
    })
  )
}

export function resetAllMocks() {
  resetSupabaseMocks()
  resetClerkMocks()
}

mock.module("@/lib/db/client", () => ({
  MissingSupabaseCredentialsError,
  supabase: mockSupabase,
}))
