// A failed/cancelled recording does not imply the word is silent: speech is the fallback.
// Only the speech error handler reports failure if that fallback also cannot play.
export async function playLocalOrFallback(audio,isCurrent,fallback){
  try{await audio.play();return 'recording';}
  catch{
    if(!isCurrent())return 'canceled';
    fallback();return 'speech';
  }
}
