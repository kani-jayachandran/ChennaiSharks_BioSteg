-- BioSteg-Locker Database Schema
-- Run this in your Supabase SQL editor

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- User profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(32) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    original_filename VARCHAR(255) NOT NULL,
    original_mimetype VARCHAR(100) NOT NULL,
    original_size BIGINT NOT NULL,
    s3_image_url TEXT NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    document_status VARCHAR(20) DEFAULT 'active' CHECK (document_status IN ('active', 'expired', 'deleted')),
    encryption_metadata JSONB,
    document_text_preview TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT valid_time_window CHECK (end_time > start_time),
    CONSTRAINT valid_title_length CHECK (LENGTH(title) >= 3)
);

-- Biometric templates table
CREATE TABLE IF NOT EXISTS biometric_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    biometric_type VARCHAR(20) NOT NULL CHECK (biometric_type IN ('fingerprint', 'face')),
    template_data JSONB NOT NULL,
    quality_score DECIMAL(3,2) CHECK (quality_score >= 0 AND quality_score <= 1),
    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Unique constraint: one template per user per biometric type
    UNIQUE(user_id, biometric_type)
);

-- Access logs table
CREATE TABLE IF NOT EXISTS access_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    document_id VARCHAR(32) NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    access_type VARCHAR(50) NOT NULL,
    success BOOLEAN NOT NULL,
    failure_reason TEXT,
    confidence_score DECIMAL(3,2),
    ip_address INET,
    user_agent TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(document_status);
CREATE INDEX IF NOT EXISTS idx_documents_time_window ON documents(start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_biometric_templates_user_id ON biometric_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_biometric_templates_type ON biometric_templates(biometric_type);

CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_document_id ON access_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_timestamp ON access_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_success ON access_logs(success);

-- Row Level Security (RLS) policies
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE biometric_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- User profiles policies
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON user_profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

-- Documents policies
CREATE POLICY "Users can view own documents" ON documents
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own documents" ON documents
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own documents" ON documents
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own documents" ON documents
    FOR DELETE USING (auth.uid() = user_id);

-- Biometric templates policies
CREATE POLICY "Users can view own biometric templates" ON biometric_templates
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own biometric templates" ON biometric_templates
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own biometric templates" ON biometric_templates
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own biometric templates" ON biometric_templates
    FOR DELETE USING (auth.uid() = user_id);

-- Access logs policies
CREATE POLICY "Users can view own access logs" ON access_logs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own access logs" ON access_logs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Functions and triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at triggers
CREATE TRIGGER update_user_profiles_updated_at 
    BEFORE UPDATE ON user_profiles 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_biometric_templates_updated_at 
    BEFORE UPDATE ON biometric_templates 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically expire documents
CREATE OR REPLACE FUNCTION expire_documents()
RETURNS void AS $$
BEGIN
    UPDATE documents 
    SET document_status = 'expired', updated_at = NOW()
    WHERE document_status = 'active' 
    AND end_time < NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old access logs (keep last 90 days)
CREATE OR REPLACE FUNCTION cleanup_old_access_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM access_logs 
    WHERE timestamp < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Create a view for document statistics
CREATE OR REPLACE VIEW document_stats AS
SELECT 
    user_id,
    COUNT(*) as total_documents,
    COUNT(CASE WHEN document_status = 'active' THEN 1 END) as active_documents,
    COUNT(CASE WHEN document_status = 'expired' THEN 1 END) as expired_documents,
    COUNT(CASE WHEN NOW() BETWEEN start_time AND end_time AND document_status = 'active' THEN 1 END) as accessible_documents,
    SUM(original_size) as total_storage_used,
    MIN(created_at) as first_document_date,
    MAX(created_at) as last_document_date
FROM documents
GROUP BY user_id;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Insert some sample data (optional - remove in production)
-- This is just for testing purposes
/*
INSERT INTO user_profiles (id, email, first_name, last_name, role) VALUES
    ('00000000-0000-0000-0000-000000000001', 'demo@example.com', 'Demo', 'User', 'user')
ON CONFLICT (id) DO NOTHING;
*/

-- Comments for documentation
COMMENT ON TABLE user_profiles IS 'Extended user profile information';
COMMENT ON TABLE documents IS 'Encrypted documents stored as steganographic images';
COMMENT ON TABLE biometric_templates IS 'Biometric templates for user authentication';
COMMENT ON TABLE access_logs IS 'Audit trail of document access attempts';

COMMENT ON COLUMN documents.s3_image_url IS 'Public URL of steganographic image in S3';
COMMENT ON COLUMN documents.s3_key IS 'S3 object key for the steganographic image';
COMMENT ON COLUMN documents.encryption_metadata IS 'Metadata about document encryption';
COMMENT ON COLUMN documents.document_text_preview IS 'First 500 characters of document text for search';

COMMENT ON COLUMN biometric_templates.template_data IS 'Encrypted biometric feature vectors';
COMMENT ON COLUMN biometric_templates.quality_score IS 'Quality score of the biometric template (0-1)';

COMMENT ON COLUMN access_logs.confidence_score IS 'Biometric verification confidence score (0-1)';
COMMENT ON COLUMN access_logs.access_type IS 'Type of access attempt (biometric_verification, etc.)';

-- Create indexes for full-text search on document content
CREATE INDEX IF NOT EXISTS idx_documents_text_search 
ON documents USING gin(to_tsvector('english', title || ' ' || COALESCE(description, '') || ' ' || COALESCE(document_text_preview, '')));

-- Function for document search
CREATE OR REPLACE FUNCTION search_documents(user_uuid UUID, search_query TEXT)
RETURNS TABLE (
    id VARCHAR(32),
    title VARCHAR(255),
    description TEXT,
    original_filename VARCHAR(255),
    created_at TIMESTAMPTZ,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id,
        d.title,
        d.description,
        d.original_filename,
        d.created_at,
        ts_rank(to_tsvector('english', d.title || ' ' || COALESCE(d.description, '') || ' ' || COALESCE(d.document_text_preview, '')), plainto_tsquery('english', search_query)) as rank
    FROM documents d
    WHERE d.user_id = user_uuid
    AND to_tsvector('english', d.title || ' ' || COALESCE(d.description, '') || ' ' || COALESCE(d.document_text_preview, '')) @@ plainto_tsquery('english', search_query)
    ORDER BY rank DESC, d.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;