/** Shapes mirrored from the backend's Pydantic response models (see docs/03_BACKEND.md's
 * endpoint table). Kept minimal — only the fields pages built so far actually read. */
export type Role = "employee" | "manager" | "hr" | "admin";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
  title: string;
  manager_id: string | null;
};

export type LoginResponse = {
  access_token: string;
  token_type: string;
  user: User;
};

export type HealthResponse = {
  status: string;
  service: string;
  mock_mode: boolean;
  database: { connected: boolean; detail: string };
  pgvector: { enabled: boolean; detail: string };
};
