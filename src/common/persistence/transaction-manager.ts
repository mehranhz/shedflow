/**
 * Lets a service commit writes across several repositories atomically without
 * knowing which ORM provides the transaction. Implementations must propagate the
 * transaction to every repository called inside `work`, and must join an
 * already-open transaction rather than nesting a new one.
 */
export abstract class TransactionManager {
  abstract runInTransaction<T>(work: () => Promise<T>): Promise<T>;
}
