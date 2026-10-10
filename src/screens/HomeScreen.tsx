import { useEffect, useRef, useState } from 'react';
import { Home, Smartphone, Volume2, VolumeX, ArrowRight, Check, Info } from 'lucide-react';
import { useGameStore } from '../store/gameStore';
import { destinations, DestinationId, missions, homeMissions } from '../game/journey';

export function HomeScreen() {
  const { life, cities, createLife, startMission, startDailyRun, soundEnabled, toggleSound, openAbout, storageWarning } = useGameStore();
  const [name, setName] = useState('');
  const [cityId, setCityId] = useState(cities[0].id);
  const [destination, setDestination] = useState<DestinationId>('canada');
  const [tab, setTab] = useState<'room' | 'phone'>('room');
  const container = useRef<HTMLDivElement>(null);
  const hasLife = !!life;
  useEffect(() => { container.current?.scrollTo({ top: 0 }); }, [hasLife]);
  const route = destinations.find(d => d.id === (life?.destination ?? destination))!;
  const chapters = life?.destination === 'home' ? homeMissions : missions;
  const button = 'press min-h-[52px] rounded-2xl border-[3px] border-ink shadow-comic font-extrabold px-4';
  return <div ref={container} className="flex-1 overflow-y-auto px-5 pt-5 pb-8 text-cream lg:px-10">
    {/* Phone: one column. Desktop (lg): two columns inside a wider centred frame */}
    <div className="mx-auto w-full max-w-md md:max-w-2xl lg:max-w-5xl lg:pt-4">
    <header className="flex justify-between items-center mb-5">
      <div><div className="font-title text-3xl text-sun">JAPA</div><div className="text-[10px] uppercase tracking-[0.2em] text-cream/60">Small steps. Big dreams.</div></div>
      <div className="flex gap-2"><button aria-label="About Japa" onClick={() => openAbout()} className={`${button} bg-navy-800 !px-3`}><Info size={19}/></button><button aria-label={soundEnabled ? 'Mute sound' : 'Unmute sound'} onClick={toggleSound} className={`${button} bg-navy-800 !px-3`}>{soundEnabled ? <Volume2 size={19}/> : <VolumeX size={19}/>}</button></div>
    </header>
    {storageWarning && <p role="alert" className="bg-chili text-ink rounded-xl p-3 mb-4 text-sm font-bold">Your browser could not save this life. Progress will last only while this page stays open.</p>}
    {!life ? <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start"><div>
      <div className="rounded-3xl bg-cream text-ink border-4 border-ink shadow-comic-lg p-5 mb-6"><div className="text-4xl mb-3">🏡 ✈️</div><h1 className="font-title text-3xl leading-tight lg:text-5xl">Every big move starts at home.</h1><p className="mt-2 text-sm font-bold text-ink/65">Earn your first wages. Keep your people close. Decide where your next life begins.</p></div>
      <label className="block text-sm font-extrabold mb-2" htmlFor="player-name">What should we call you?</label>
      <input id="player-name" maxLength={24} value={name} onChange={e => setName(e.target.value)} placeholder="Your name or nickname" className="w-full min-h-[52px] px-4 rounded-xl bg-navy-800 border-2 border-navy-600 mb-5 text-cream"/>
      </div><div>
      <fieldset><legend className="font-title text-xl mb-2">Where’s home?</legend><div className="grid grid-cols-3 gap-2 mb-5">{cities.map(c => <button key={c.id} aria-pressed={cityId === c.id} onClick={() => setCityId(c.id)} className={`${button} !px-1 ${cityId === c.id ? 'bg-sun text-ink' : 'bg-navy-800'}`}><span className="block text-2xl flag-emoji">{c.flag}</span>{c.name}</button>)}</div></fieldset>
      <fieldset><legend className="font-title text-xl mb-2">Where do you see your future?</legend><div className="space-y-2">{destinations.map(d => <button key={d.id} onClick={() => setDestination(d.id)} aria-pressed={destination === d.id} className={`w-full text-left rounded-2xl border-[3px] p-3 ${destination === d.id ? 'border-sun bg-navy-700' : 'border-navy-600 bg-navy-800'}`}><span className="flex gap-3 items-center"><span className="text-3xl flag-emoji">{d.flag}</span><span className="flex-1"><span className="block font-title text-xl">{d.name}</span><span className="text-xs text-cream/70">{d.route}</span></span><span className={`text-[10px] font-black rounded-full px-2 py-1 ${d.available ? 'bg-leaf text-ink' : 'bg-navy-950 text-cream/60'}`}>{d.available ? 'PLAY CHAPTER 1' : 'PREVIEW'}</span></span>{destination === d.id && <span className="block mt-2 text-sm text-cream/80">{d.detail}</span>}</button>)}</div></fieldset>
      <p className="text-xs text-cream/50 mt-4">Fictional journeys with simplified game requirements.</p>
      <button disabled={!route.available} onClick={() => createLife(name, cityId, destination)} className={`${button} w-full mt-4 bg-leaf text-ink disabled:opacity-40`}>{route.available ? 'Make yourself at home →' : 'This journey is coming next'}</button>
    </div></div> : <div className="lg:grid lg:grid-cols-2 lg:gap-10 lg:items-start"><div>
      <div className="flex justify-between items-end mb-4"><div><p className="text-sm text-cream/60">Welcome home,</p><h1 className="font-title text-3xl">{life.name}</h1></div><span className="text-xs text-cream/60">{cities.find(c => c.id === life.cityId)?.name} · Day {life.attempts + 1}</span></div>
      <div className="flex gap-2 mb-4">{(['room', 'phone'] as const).map(t => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className={`${button} flex-1 flex items-center justify-center gap-2 ${tab === t ? 'bg-cream text-ink' : 'bg-navy-800'}`}>{t === 'room' ? <Home size={17}/> : <Smartphone size={17}/>} {t === 'room' ? 'My room' : 'My phone'}</button>)}</div>
      {tab === 'room' ? <>
        <div className="relative rounded-3xl overflow-hidden border-4 border-ink shadow-comic-lg bg-[#e3c597] h-48 lg:h-72 mb-4" role="img" aria-label={life.chapter >= 2 ? 'Your room, with a desk, plants and your document folder' : 'Your starter room, with a bed, a window and packed bags'}>
          <div className="absolute top-4 left-5 text-ink/70 text-xs font-black">{life.chapter >= 2 ? 'A little more yours.' : 'Your own little corner.'}</div>
          <div className="absolute right-6 top-6 bg-sky/60 border-4 border-[#7d5738] rounded-lg w-16 h-20 flex items-center justify-center text-3xl">☀️</div>
          <div className="absolute inset-x-0 bottom-0 h-14 bg-[#9c704b] border-t-4 border-[#7d5738]"/>
          <span className="absolute left-5 bottom-7 text-6xl">🛏️</span><span className="absolute right-6 bottom-6 text-5xl">{life.chapter >= 2 ? '🪴' : '🎒'}</span><span className="absolute left-36 bottom-8 text-4xl">{life.chapter >= 1 ? '📚' : '📦'}</span>
          <span className="absolute bottom-2 left-4 text-xs font-black text-cream">{life.chapter}/4 milestones</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">{Object.entries(life.stats).map(([key, v]) => <div key={key} className="bg-navy-800 rounded-xl p-3"><span className="text-xs text-cream/65">{{money: '💵 Savings', papers: '📄 Preparation', morale: '🙂 Wellbeing', familyPressure: '📲 Family pressure'}[key]}</span><div className="h-2 bg-navy-950 rounded-full mt-2 overflow-hidden"><div className={`h-full ${key === 'familyPressure' ? 'bg-chili' : 'bg-leaf'}`} style={{width: `${v}%`}}/></div><span className="text-xs font-bold">{v}/100</span></div>)}</div>
      </> : <div className="space-y-3 mb-4"><div className="bg-cream text-ink rounded-2xl p-4"><p className="text-xs font-black mb-2">📩 LATEST MESSAGE</p><p className="font-bold text-sm">{life.lastMessage}</p></div><div className="bg-navy-800 rounded-2xl p-4"><p className="font-title text-lg">People in your corner</p><p className="text-sm mt-2">Mama · {life.helpedMama === null ? 'Waiting to hear from you' : life.helpedMama ? 'Remembers your help' : 'Knows you’re saving for your future'}</p><p className="text-sm mt-2">{life.destination === 'home' ? 'Customer' : 'Agent'} · {life.trustedAgent === null ? 'You haven’t met yet' : life.trustedAgent ? 'You paid the upfront fee' : 'You asked for written details'}</p><p className="text-sm mt-2">Boss · Has work when you need it</p></div></div>}
      </div><div>
      <div className="border-2 border-navy-600 rounded-2xl p-4 mb-4"><span className="text-xs uppercase font-black text-sun">Your plan</span><p className="font-title text-xl mt-1"><span className="flag-emoji">{route.flag}</span> {route.name} · {route.route}</p><ol className="mt-3 space-y-2">{chapters.map((m, i) => <li key={m} className={`flex gap-2 items-center text-sm ${i > life.chapter ? 'text-cream/40' : 'text-cream'}`}>{i < life.chapter ? <Check size={16} className="text-leaf"/> : <span className={`w-4 h-4 rounded-full border-2 ${i === life.chapter ? 'border-sun bg-sun/30' : 'border-navy-600'}`}/>} {m}</li>)}</ol></div>
      {life.chapter < 4 ? <><p className="text-xs text-cream/65 mb-2">{life.chapter === 0 ? 'Delivery → wages → a call with Mama' : 'Three street decisions · Your choices carry home'}</p><button onClick={startMission} className={`${button} w-full bg-leaf text-ink flex items-center justify-between`}>{life.attempts > life.chapter ? 'Try your next step again' : chapters[life.chapter]}<ArrowRight size={20}/></button></> : <div className="bg-leaf/15 border-2 border-leaf rounded-2xl p-4"><p className="font-title text-xl text-leaf">Your first chapter is complete.</p><p className="text-sm mt-2">{life.destination === 'home' ? 'Your business has its first order. Growing it is the next chapter.' : 'Your appointment is complete. The visa decision and life abroad are the next chapter.'}</p><p className="text-xs text-cream/60 mt-2">More story chapters are coming. Your life stays saved here.</p></div>}
      <button onClick={startDailyRun} className={`${button} w-full mt-3 bg-navy-800`}>🏛️ Play today’s street challenge</button><p className="text-[11px] text-cream/50 text-center mt-2">Daily challenges are separate from your story.</p>
      <p className="text-[11px] text-cream/40 text-center mt-5">{storageWarning ? 'Progress is in memory only.' : 'Saved on this browser.'} Completed missions carry forward; leaving a mission restarts that mission. Fictional game journeys.</p>
    </div></div>}
    </div>
  </div>;
}
