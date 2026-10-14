import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../lib/api.js';

export function useReceiptUrl(path) {
  return useQuery({
    queryKey: ['receipt', path],
    enabled: !!path,
    queryFn: async () => {
      if (path.startsWith('data:')) return path;
      const { signedUrl } = await apiFetch(`/api/receipts?path=${encodeURIComponent(path)}`);
      return signedUrl;
    },
    staleTime: 25 * 60_000,
  });
}
