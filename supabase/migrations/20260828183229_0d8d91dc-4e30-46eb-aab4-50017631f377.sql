-- Storage RLS policies for project-images bucket (private)
CREATE POLICY "project-images_select_own" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "project-images_insert_own" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "project-images_update_own" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "project-images_delete_own" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'project-images' AND (storage.foldername(name))[1] = auth.uid()::text);
