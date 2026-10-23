/* AFTERHOURS — templated speech. Lines are assembled from the kind of encounter, who is speaking (their strongest trait),
   how the two feel about each other, and an optional memory callback. Fully deterministic: no generated text. */
(function () {
  'use strict';
  var AH = window.AH;
  var TR = ['ambition', 'honesty', 'sociability', 'greed', 'temper'];

  var L = {
    greet: {
      d: ['{tod}, {o}.', 'Oh, hello {o}.', '{o}. Fancy seeing you here.'],
      sociability: ['{o}! Just who I hoped to see!', 'There you are, {o}! Come, sit.'],
      temper: ['{o}. What is it now?', 'Hm. {o}.'],
      honesty: ['Hello, {o}. Honestly, good to see you.', '{o}. Plainly put: nice to see you.'],
      ambition: ['{o}, good timing. I have plans.', '{o}. I have a minute. Just one.'],
      greed: ['{o}! How is business?', '{o}. Not cheap round here, is it?']
    },
    cold: { d: ['{o}.', 'Oh. It is you.', '{o}. Did not expect you here.'], temper: ['You again.', '{o}. Of all places.'], honesty: ['{o}. I will not pretend I am thrilled.'] },
    warm: { d: ['{o}! My favourite person today.', 'Look who it is! Hello, {o}.', '{o}! Just what the day needed.'], sociability: ['{o}!! Come here, tell me everything.'], temper: ['{o}. You are the one person I do not mind.'] },
    topic: {
      d: ['Lovely light today.', 'Quiet day, really.', 'Did the bells sound odd to you?', 'I keep losing my pencil.', 'They say the weather turns tomorrow.'],
      sociability: ['Everyone is talking about the new awning.', 'I heard three bits of gossip before breakfast.'],
      temper: ['The noise on this street is something else.', 'Someone left a cart in my way again.'],
      honesty: ['I will not pretend today has been easy.', 'Truthfully, I would rather be here than at work.'],
      ambition: ['Between us, I am up for something bigger.', 'I have been rearranging my whole week.'],
      greed: ['Rents are going up, I am told.', 'I saw a lovely coat. It costs a fortune.']
    },
    farewell: {
      d: ['Well, back to it.', 'See you around, {o}.', 'I should go. Take care.'],
      sociability: ['Do not be a stranger, {o}!'], temper: ['Right. I am off.'], ambition: ['Must run. Things to build.'], greed: ['Time is money. Bye, {o}.'], honesty: ['It was good talking. Truly.']
    },
    joke: {
      d: ['I told the pigeon my plans. It left.', 'I bought a clock. Now I am late for something else.', 'Why was the clerk calm? Everything was filed.'],
      sociability: ['A man walks into a bakery. He says nothing, it is a tragedy.'], greed: ['I invest in puns. High risk, low return.'], temper: ['I tried yoga. The mat started it.']
    },
    laugh: { d: ['Ha! Stop it, my sides.', 'Oh, that is terrible. Tell it again.', 'Ha! You always get me.'], sociability: ['Ha ha ha! I will be repeating that all week.'] },
    ask: { d: ['{o}, could you spare a hand with something?', 'I am in a bit of a jam, {o}.'], greed: ['{o}, I am short this week. Could you help?'], ambition: ['{o}, I need a favour for something important.'] },
    offer: { d: ['Of course. Leave it with me.', 'Say no more. I will sort it.'], honesty: ['Happy to. No strings.'], sociability: ['Anything for you, {o}!'] },
    thanks: { d: ['You are a lifesaver, {o}.', 'I owe you one.'], honesty: ['I mean it: thank you.'], temper: ['Hm. Thanks. I mean that.'] },
    snipe: {
      d: ['You are late again, {o}.', 'Did you really have to say that, {o}?', 'Is this your idea of manners?'],
      temper: ['I have had quite enough of you, {o}.', 'Do not look at me like that.'], honesty: ['I will say it to your face, {o}: that was unfair.'], ambition: ['You keep getting in my way, {o}.'], greed: ['You still owe me, {o}.']
    },
    retort: { d: ['Oh, that is rich, coming from you.', 'Do not start with me.', 'At least I try.'], temper: ['Say that again. Go on.'], sociability: ['Everyone says you are impossible, you know.'] },
    escalate: { d: ['You always do this.', 'I am done being polite.', 'Say that again, I dare you.'], temper: ['Enough! I will not be spoken to like that!'] },
    huff: { d: ['Hmph. We are finished here.', 'Forget it. Just forget it.', 'I am leaving.'], honesty: ['I said what I meant. Good day.'] },
    cbGood: { d: ['Still smiling about {pl}.', 'Remember {pl}? That was a good one.'] },
    cbBad: { d: ['Not another {pl} like last time, I hope.', 'I have not forgotten {pl}.'] }
  };

  function flavor(ch) {
    var best = null, v = 0.7;
    TR.forEach(function (k) { if (ch.traits[k] > v) { v = ch.traits[k]; best = k; } });
    return best;
  }
  function pick(cat, ch, rng, vars) {
    var set = L[cat], f = flavor(ch), arr = (f && set[f] && rng.chance(0.65)) ? set[f] : set.d;
    var s = rng.pick(arr);
    return s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
  }
  function tod(min) { var h = (min % 1440) / 60; return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening'; }

  // kind: chat | laugh | favour | argument. pair = [A, B] characters. ctx: {pl, minute, rel:[ab, ba], cb:{good:bool,pl}|null, giver:0|1}
  AH.dialogue = {
    make: function (kind, pair, ctx, rng) {
      var A = pair[0], B = pair[1];
      function v(s, o) { return { o: o.first, pl: ctx.pl, tod: tod(ctx.minute) }; }
      function say(w, cat, extra) {
        var sp = w === 0 ? A : B, ot = w === 0 ? B : A, vars = v(null, ot);
        if (extra) for (var k in extra) vars[k] = extra[k];
        return { who: sp.id, text: pick(cat, sp, rng, vars) };
      }
      var a = ctx.rel[0], b = ctx.rel[1], cold = Math.max(a.r, b.r) > 0.4 || (a.a + b.a) / 2 < -0.2, warm = (a.a + b.a) / 2 > 0.35;
      var first = (A.traits.temper + A.traits.sociability * 0.2 > B.traits.temper + B.traits.sociability * 0.2) ? 0 : 1;
      var out = [], sec = 1 - first;
      var greetCat = cold ? 'cold' : warm ? 'warm' : 'greet';
      if (kind === 'chat') {
        out.push(say(first, greetCat)); out.push(say(sec, 'topic'));
        if (ctx.cb) out.push(say(first, ctx.cb.good ? 'cbGood' : 'cbBad', { pl: ctx.cb.pl }));
        else out.push(say(first, 'topic'));
        out.push(say(sec, 'farewell'));
      } else if (kind === 'laugh') {
        out.push(say(first, greetCat)); out.push(say(sec, 'joke')); out.push(say(first, 'laugh'));
        if (ctx.cb && ctx.cb.good) out.push(say(sec, 'cbGood', { pl: ctx.cb.pl }));
        out.push(say(sec, 'farewell'));
      } else if (kind === 'favour') {
        var g = ctx.giver, r = 1 - g;
        out.push(say(r, 'ask')); out.push(say(g, 'offer')); out.push(say(r, 'thanks')); out.push(say(g, 'farewell'));
      } else {
        if (ctx.cb && !ctx.cb.good) out.push(say(first, 'cbBad', { pl: ctx.cb.pl }));
        out.push(say(first, 'snipe')); out.push(say(sec, 'retort')); out.push(say(first, 'escalate')); out.push(say(sec, 'huff'));
      }
      return out;
    }
  };
})();
