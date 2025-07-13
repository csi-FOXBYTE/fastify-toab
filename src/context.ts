import { AsyncLocalStorage } from "async_hooks";

const contextLocalStorage = new AsyncLocalStorage();

const serviceLockLocalStorage = new AsyncLocalStorage<boolean>();

export function lockService() {
  serviceLockLocalStorage.enterWith(true);
}

export function unlockService() {
  serviceLockLocalStorage.disable();
}

export function getContext() {
  const store = contextLocalStorage.getStore();
  if (!store || serviceLockLocalStorage.getStore())
    throw new Error(
      "No context set, are you trying to access the context outside of a service function?"
    );

  return store;
}

export function setContext(ctx: unknown) {
  return contextLocalStorage.enterWith(ctx);
}
