ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS whatsapp_number text,
  ADD COLUMN IF NOT EXISTS notify_each_expense boolean NOT NULL DEFAULT true;