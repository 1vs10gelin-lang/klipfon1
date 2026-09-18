import {Header,Footer} from '@/components/klipfon/shared';
import {AuthForm} from '@/components/klipfon/auth-form';
export default function Page(){return <><Header/><main className="screen-center"><div className="eyebrow">HESAP KURTARMA</div><h1>Şifreni yenile.</h1><p>Kayıtta verilen kurtarma kodunu kullan. Şifren yenilenince açık oturumların kapanır.</p><div className="panel mt-6"><AuthForm mode="recover"/></div></main><Footer/></>}
