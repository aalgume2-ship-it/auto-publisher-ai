-- Expose the real render and durable-storage phases to API clients.
ALTER TYPE "VideoStatus" ADD VALUE IF NOT EXISTS 'RENDERING' AFTER 'GENERATING';
ALTER TYPE "VideoStatus" ADD VALUE IF NOT EXISTS 'UPLOADING' AFTER 'RENDERING';
