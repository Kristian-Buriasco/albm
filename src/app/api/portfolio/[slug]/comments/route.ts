import { handleCommentDelete, handleCommentGet, handleCommentPost } from '@/lib/comment-handlers';

type Params = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Params) {
  const { slug } = await params;
  return handleCommentGet(req, slug, 'portfolio');
}

export async function POST(req: Request, { params }: Params) {
  const { slug } = await params;
  return handleCommentPost(req, slug, 'portfolio');
}

export async function DELETE(req: Request, { params }: Params) {
  const { slug } = await params;
  return handleCommentDelete(req, slug, 'portfolio');
}
