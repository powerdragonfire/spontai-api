export type AuthContext =
  | {
      kind: "oauth_access";
      sub: string;
      clientId: string;
      scopes: string[];
      jti: string;
    }
  | {
      kind: "api_key";
      sub: string;
      scopes: string[];
      jti: string;
    };
