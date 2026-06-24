import { redirect } from 'next/navigation'

// ForgeCAD is a static vanilla-JS app (Safari 7 / 2013 compatible).
// Next.js is only here to provide the preview server. We redirect to the
// static HTML file in /public, which serves all the JS/CSS/assets at their
// expected paths.
export default function Home() {
  redirect('/index.html')
}
