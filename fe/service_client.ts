import { HttpMethod, SESSION_HEADER } from "../common";
import { ErrorType, TypedError } from "../errors";
import { parseNamedType } from "../named_type_util";
import {
  ServiceDescriptor,
  SignedInServiceDescriptor,
  SignedOutServiceDescriptor,
} from "../service_descriptor";
import { SessionStorage } from "./session_storage";

export class ServiceClient {
  public hostName: string;
  public onUnauthenticated: () => Promise<void> | void;
  public onError: (errorMessage: string) => Promise<void> | void;

  public constructor(private sessionStorage: SessionStorage) {}

  public static create(hostName: string): ServiceClient {
    return new ServiceClient(new SessionStorage());
  }

  public async fetchSignedOut<Request, Response>(
    request: Request,
    serviceDescriptor: SignedOutServiceDescriptor<Request, Response>
  ): Promise<Response> {
    return await this.fetch(request, serviceDescriptor, new Headers());
  }

  public async fetchSignedIn<Request, Response>(
    request: Request,
    serviceDescriptor: SignedInServiceDescriptor<Request, Response>
  ): Promise<Response> {
    let headers = new Headers();
    let session = await this.sessionStorage.read();
    headers.set(SESSION_HEADER, session);
    return await this.fetch(
      request,
      serviceDescriptor,
      headers,
      this.onUnauthenticated
    );
  }

  private async fetch<Request, Response>(
    request: Request,
    serviceDescriptor: ServiceDescriptor<Request, Response>,
    headers: Headers,
    onUnauthenticated?: () => Promise<void> | void
  ): Promise<Response> {
    let response = await fetch(
      `${this.hostName}${serviceDescriptor.pathname}`,
      {
        method: HttpMethod[HttpMethod.POST],
        body: JSON.stringify(request),
        headers: headers,
      }
    );
    if (!response.ok) {
      let errorMessage = await response.text();
      let error = new TypedError(response.status, errorMessage);
      if (onUnauthenticated && response.status === ErrorType.Unauthenticated) {
        onUnauthenticated();
      }
      if (this.onError) {
        this.onError(error.message);
      }
      throw error;
    }

    let data = await response.json();
    return parseNamedType(data, serviceDescriptor.responseDescriptor);
  }
}