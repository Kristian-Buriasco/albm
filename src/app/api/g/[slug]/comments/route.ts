import { handleCommentDelete, handleCommentPost } from '@/lib/comment-handlers';

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  const { handleCommentGet } = await import('@/lib/comment-handlers');
  const { slug } = await params;
  return handleCommentGet(req, slug, 'client');
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  return handleCommentPost(req, slug, 'client');
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  return handleCommentDelete(req, slug, 'client');
}
