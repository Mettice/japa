import { Home, Package, ArrowRight, Phone } from 'lucide-react';
import { Portrait } from '../components/SwipeCard';
import { Bars } from '../components/Bars';
import { useGameStore } from '../store/gameStore';
import { DELIVERY_DISTANCE, DELIVERY_WAGES } from '../game/journey';

export function DeliveryScreen() {
  const { deliveryPhase, acceptDelivery, collectDeliveryWages, restartGame, getCurrentCard, getCharacter, applyChoice, activeEnding, stats } = useGameStore();
  const card = getCurrentCard();
  const mama = getCharacter('mama');
  const talking = deliveryPhase === 'conversation';
  const paid = deliveryPhase === 'payment';
  const button = 'press min-h-[60px] w-full rounded-2xl border-[3px] border-ink shadow-comic font-extrabold px-4 text-left';
  return <div className="flex-1 min-h-0 flex flex-col text-cream w-full max-w-xl mx-auto">
    <header className="border-b-4 border-ink"><Bars/><div className="flex items-center justify-between px-5 pb-3"><span className="text-xs font-black uppercase text-sun">{talking ? 'A moment with Mama' : paid ? 'Delivery complete' : 'Today’s job'}</span><button onClick={restartGame} aria-label="Return home" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl bg-navy-800"><Home size={18}/></button></div></header>
    <div className="flex-1 overflow-y-auto px-5 py-6">
      {!talking ? <>
        <div className="bg-cream text-ink rounded-3xl border-4 border-ink shadow-comic-lg p-6"><div className="w-16 h-16 rounded-2xl bg-sun flex items-center justify-center mb-4"><Package size={36}/></div><p className="text-xs font-black uppercase text-ink/50">{paid ? 'Customer · Parcel received' : 'Boss · Local delivery'}</p><h1 className="font-title text-3xl mt-2">{paid ? 'You made it.' : 'Your first delivery.'}</h1><p className="font-bold text-sm mt-3 leading-relaxed">{paid ? 'The customer checks the parcel, smiles, and sends your wages. Your phone buzzes: Mama is calling.' : 'A customer down the road needs a parcel. Carry it through the traffic and get paid when you arrive.'}</p></div>
        <div className="bg-navy-800 rounded-2xl p-4 mt-5 flex justify-between"><span className="text-sm font-bold">{paid ? 'Wages ready to collect' : 'Delivery wage'}</span><span className="font-title text-xl text-leaf">+{DELIVERY_WAGES} savings</span></div>
        {!paid && <div className="text-sm text-cream/70 mt-4 space-y-2"><p>📍 {DELIVERY_DISTANCE}m to the customer · About 20–30 seconds</p><p>Swipe or use arrow keys to dodge, jump, and slide. Cash on the street adds tips.</p><p>After the delivery, take your time talking to Mama.</p></div>}
        <button onClick={paid ? collectDeliveryWages : acceptDelivery} className={`${button} bg-leaf text-ink mt-6 flex justify-between items-center`}>{paid ? 'Collect wages & answer Mama' : 'Accept delivery'}{paid ? <Phone size={20}/> : <ArrowRight size={20}/>}</button>
        {paid && <p className="text-xs text-cream/50 mt-3">Savings now: {stats.money}/100. Your wage is added when you collect.</p>}
      </> : card && mama && <>
        <div className="flex items-center gap-3 mb-5"><Portrait character={mama} size={64}/><div><p className="font-title text-2xl">{mama.name}</p><p className="text-xs text-cream/60">Phone call · No rush. She’s listening.</p></div></div>
        <div key={card.id} className="bg-cream text-ink border-4 border-ink shadow-comic-lg rounded-3xl p-6"><p className="font-bold text-lg leading-relaxed">{card.situation}</p></div>
        <p className="text-xs font-black uppercase text-cream/50 mt-6 mb-3">What do you say?</p>
        <div className="space-y-3">{(['left', 'right'] as const).map(side => <button key={`${card.id}-${side}`} disabled={!!activeEnding} onClick={() => applyChoice(side)} className={`${button} ${side === 'left' ? 'bg-leaf text-ink' : 'bg-navy-700 text-cream'}`}>{(side === 'left' ? card.leftChoice : card.rightChoice).text}</button>)}</div>
        <p className="mt-5 text-xs text-cream/50">Finish the call to bring your wages and choices home.</p>
      </>}
    </div>
  </div>;
}
