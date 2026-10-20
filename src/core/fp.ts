export type Unary<A, B> = (value: A) => B;

export function identity<T>(value: T): T {
	return value;
}

export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, ab: Unary<A, B>): B;
export function pipe<A, B, C>(value: A, ab: Unary<A, B>, bc: Unary<B, C>): C;
export function pipe<A, B, C, D>(value: A, ab: Unary<A, B>, bc: Unary<B, C>, cd: Unary<C, D>): D;
export function pipe<A, B, C, D, E>(
	value: A,
	ab: Unary<A, B>,
	bc: Unary<B, C>,
	cd: Unary<C, D>,
	de: Unary<D, E>,
): E;
export function pipe<A, B, C, D, E, F>(
	value: A,
	ab: Unary<A, B>,
	bc: Unary<B, C>,
	cd: Unary<C, D>,
	de: Unary<D, E>,
	ef: Unary<E, F>,
): F;
export function pipe(value: defined, ...steps: ReadonlyArray<Unary<defined, defined>>): defined {
	let current = value;
	for (const step of steps) {
		current = step(current);
	}
	return current;
}

export function flow<A, B>(ab: Unary<A, B>): Unary<A, B>;
export function flow<A, B, C>(ab: Unary<A, B>, bc: Unary<B, C>): Unary<A, C>;
export function flow<A, B, C, D>(ab: Unary<A, B>, bc: Unary<B, C>, cd: Unary<C, D>): Unary<A, D>;
export function flow<A, B, C, D, E>(
	ab: Unary<A, B>,
	bc: Unary<B, C>,
	cd: Unary<C, D>,
	de: Unary<D, E>,
): Unary<A, E>;
export function flow(
	...steps: ReadonlyArray<Unary<defined, defined>>
): Unary<defined, defined> {
	return (value: defined) => {
		let current = value;
		for (const step of steps) {
			current = step(current);
		}
		return current;
	};
}
