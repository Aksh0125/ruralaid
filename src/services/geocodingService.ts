import https from 'https';
import { URL } from 'url';

interface OpenCageResponse {
  results?: Array<{
    components?: Record<string, unknown>;
  }>;
}

function fetchJson(url: string): Promise<OpenCageResponse> {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        const { statusCode } = res;
        const chunks: Buffer[] = [];

        res.on('data', (chunk) => {
          chunks.push(Buffer.from(chunk));
        });

        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            const json = JSON.parse(raw) as OpenCageResponse;
            if (typeof statusCode === 'number' && statusCode >= 200 && statusCode < 300) {
              resolve(json);
            } else {
              reject(new Error(`Geocoding API returned ${statusCode}: ${raw}`));
            }
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

export async function getDistrictFromCoordinates(latitude: number, longitude: number): Promise<string> {
  const apiKey = process.env.OPENCAGE_API_KEY;
  if (!apiKey) {
    return 'Unknown District';
  }

  const url = new URL('https://api.opencagedata.com/geocode/v1/json');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('q', `${latitude},${longitude}`);
  url.searchParams.set('no_annotations', '1');
  url.searchParams.set('language', 'en');
  url.searchParams.set('limit', '1');

  const response = await fetchJson(url.toString());
  const components = response.results?.[0]?.components;
  if (!components) {
    return 'Unknown District';
  }

  return (
    String(
      components.city_district ||
        components.suburb ||
        components.village ||
        components.town ||
        components.city ||
        components.county ||
        components.state_district ||
        components.state ||
        'Unknown District'
    )
  );
}
