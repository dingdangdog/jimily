const prefix = "api/entry/user/api-token";

export type ApiTokenExpiryPreset = "30d" | "360d" | "forever";

export interface IssueApiTokenResult {
  token: string;
  expiresAt: string | null;
  expiryPreset: ApiTokenExpiryPreset;
  user: { id: number; username: string; name: string };
}

export const issueApiToken = (data: {
  expiry: ApiTokenExpiryPreset;
}): Promise<IssueApiTokenResult> => {
  return doApi.post(`${prefix}/issue`, data);
};
