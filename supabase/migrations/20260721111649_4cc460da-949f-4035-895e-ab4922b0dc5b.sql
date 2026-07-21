
CREATE TABLE public.payslips (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period TEXT,
  employer TEXT,
  gross NUMERIC,
  net NUMERIC,
  deductions NUMERIC,
  summary TEXT,
  file_name TEXT,
  file_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payslips TO authenticated;
GRANT ALL ON public.payslips TO service_role;
ALTER TABLE public.payslips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own payslips" ON public.payslips FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users read own payslips files" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payslips' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users upload own payslips files" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payslips' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users delete own payslips files" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payslips' AND auth.uid()::text = (storage.foldername(name))[1]);
