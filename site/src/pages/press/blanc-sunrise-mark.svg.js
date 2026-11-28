import mark from '../../../../assets/sunrise-mark.svg?raw';

export function GET() {
  return new Response(mark, { headers: { 'Content-Type': 'image/svg+xml' } });
}
