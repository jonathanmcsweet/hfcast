/**
 * What a failed request throws.
 *
 * Its own module so the shape checks can use it without pulling in the
 * client, which imports the whole fine-grid packing. A test that reads
 * the checks should not have to load the network layer to do it.
 */
export class ApiError extends Error {
  /** 0 when the request never reached the server, or came back unusable. */
  readonly status: number;
  constructor(message: string, status: number, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ApiError';
    this.status = status;
  }
}
