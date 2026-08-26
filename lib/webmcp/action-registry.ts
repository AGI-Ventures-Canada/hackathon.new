export type WebMcpActionHandlers<TActions> = {
  [TName in keyof TActions]: (payload: TActions[TName]) => void
}

export class WebMcpActionRegistry<TContext, TActions> {
  private context: TContext
  private handlers: WebMcpActionHandlers<TActions>

  constructor(
    context: TContext,
    handlers: WebMcpActionHandlers<TActions>,
  ) {
    this.context = context
    this.handlers = handlers
  }

  update(
    context: TContext,
    handlers: WebMcpActionHandlers<TActions>,
  ): void {
    this.context = context
    this.handlers = handlers
  }

  readonly getContext = (): TContext => this.context

  dispatch<TName extends keyof TActions>(
    name: TName,
    payload: TActions[TName],
  ): void {
    this.handlers[name](payload)
  }
}
