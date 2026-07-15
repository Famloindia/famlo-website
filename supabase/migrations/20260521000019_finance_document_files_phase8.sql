create table if not exists finance_document_files (
  id uuid primary key default gen_random_uuid(),
  artifact_type text not null,
  artifact_id uuid not null,
  storage_path text not null,
  checksum text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes integer not null default 0,
  generated_at timestamptz not null default now(),
  generated_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_document_files_artifact_unique_idx
  on finance_document_files (artifact_type, artifact_id);

create unique index if not exists finance_document_files_storage_path_unique_idx
  on finance_document_files (storage_path);

create index if not exists finance_document_files_generated_at_idx
  on finance_document_files (generated_at desc);
