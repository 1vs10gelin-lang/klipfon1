'use client';
export default function ErrorPage({reset}:{reset:()=>void}){return <main className="screen-center"><h1>Kısa bir aksaklık var.</h1><p>Sayfa şu anda yüklenemedi. İşlem sonucu görünmediyse yeniden ödeme yapmadan önce hesap hareketlerini kontrol et.</p><button className="btn" onClick={reset}>Tekrar dene</button><a className="muted-link block mt-5" href="/">Ana sayfaya dön</a></main>}
