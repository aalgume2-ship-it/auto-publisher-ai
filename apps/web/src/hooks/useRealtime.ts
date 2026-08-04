import { useEffect, useRef } from 'react';
import { useStudioStore } from '../store/studioStore';

export function useRealtimePipeline(runId: string | null) {
  const syncPipelineUpdate = useStudioStore((state) => state.syncPipelineUpdate);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!runId) return;

    // Use proxied path for local dev or env var for production
    const sseUrl = process.env.NEXT_PUBLIC_API_URL 
      ? `${process.env.NEXT_PUBLIC_API_URL}/v1/realtime/pipeline/${runId}`
      : `http://localhost:3100/api/v1/realtime/pipeline/${runId}`; // Assuming proxy setup

    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.addEventListener('pipeline.update', (event) => {
      try {
        const data = JSON.parse(event.data);
        syncPipelineUpdate(data);
      } catch (err) {
        console.error('Failed to parse SSE data', err);
      }
    });

    es.onerror = (err) => {
      console.error('SSE Error:', err);
      // Close on hard error to prevent infinite reconnect loops during dev
      es.close();
    };

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [runId, syncPipelineUpdate]);
}
