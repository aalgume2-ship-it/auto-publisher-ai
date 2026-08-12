import { redirect } from 'next/navigation';

/** Temporary product-test entry point: open the Studio directly. */
export default function Home() {
  redirect('/create');
}
