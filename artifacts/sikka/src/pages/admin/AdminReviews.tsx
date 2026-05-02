import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Star, Trash2 } from 'lucide-react';

const AdminReviews = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api.get('/reviews')
      .then((data: any) => setReviews(data || []))
      .catch((err: any) => toast.error(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const deleteReview = async (id: string) => {
    try {
      await api.delete(`/reviews/${id}`);
      setReviews(prev => prev.filter(r => r.id !== id));
    } catch (err: any) { toast.error(err.message); }
  };

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading...</p>;

  return (
    <div className="space-y-4">
      {reviews.length === 0 && <p className="text-muted-foreground text-sm">No reviews yet.</p>}
      {reviews.map((review) => (
        <Card key={review.id}>
          <CardContent className="p-4 flex items-start justify-between">
            <div>
              <div className="flex items-center gap-1 mb-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-muted'}`} />
                ))}
              </div>
              {review.comment && <p className="text-sm text-foreground">{review.comment}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(review.createdAt).toLocaleDateString()}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => deleteReview(review.id)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminReviews;
