let statCount=0
let changeStat=()=>{
    statCount++
    if(statCount<2){
      var newStat=document.createElement('textarea')
    newStat.placeholder='какое сегодня у вас настроение'
    stextAreaStat.appendChild(newStat)  
    chStat.innerHTML=''
  }
  let statBtn=document.createElement('button')
  statBtn.innerHTML='Изменить'
  statBtn.style.backgroundColor='rgb(199, 208, 238)'
  statBtn.style.border='none'
  statBtn.style.borderRadius='5px'
  statBtn.style.height='20px'
  statBtn.style.width='100px'
  statBtn.style.cursor='pointer'
  stextAreaStat.appendChild(statBtn) 

  statBtn.addEventListener('click', function() {
  let textStat=newStat.value
    
    newP.innerHTML=textStat
    
    stextAreaStat.appendChild(newP)  

    chStat.innerHTML='изменить статус'
    newStat.remove()
    statBtn.remove()
    close.remove()
    statCount=0

});

let close=document.createElement('button')
close.innerHTML='Отмена'
close.style.backgroundColor='rgb(199, 208, 238)'
close.style.border='none'
close.style.borderRadius='5px'
close.style.height='20px'
close.style.width='100px'
close.style.marginLeft='10px'
close.style.cursor='pointer'
stextAreaStat.appendChild(close) 

close.addEventListener('click', function() {
    chStat.innerHTML='изменить статус'
    newStat.remove()
    statBtn.remove()
    close.remove()
    statCount=0

});
}


const currentDate = new Date()
const day = currentDate.getDate(); // День месяца (1-31)
const month = currentDate.toLocaleString('default', { month: 'short' }); // Короткое название месяца (например, "фев")
const hours = currentDate.getHours(); // Часы (0-23)
const minutes = currentDate.getMinutes(); // Минуты (0-59)

// Форматируем дату в нужный вид
const formattedDate = `${day} ${month} в ${hours}:${minutes < 10 ? '0' + minutes : minutes}`;

let newPost=()=>{

  // Находим исходный пост
const originalPost = document.querySelector('.post');

// Клонируем пост
const clonedPost = originalPost.cloneNode(true);



// Изменяем дату

const clonedDate = clonedPost.querySelector('.date');
clonedDate.textContent = formattedDate;

// Изменяем основной текст поста
const clonedContent = clonedPost.querySelector('.content p');

clonedContent.innerHTML = areaPost.value;
const postPhoto = clonedPost.querySelector('.post_photo')
postPhoto.remove()
// Добавляем клонированный пост в DOM
deskPost.appendChild(clonedPost);
}

let openInfo=(a)=>{
  if(a==1){

    dopolInfo.style.display='block'
    clsBtn.style.display='block'
    opBtn.style.display='none'
  }else if(a==2){
    dopolInfo2.style.display='block'
    clsBtn2.style.display='block'
    opBtn2.style.display='none'   
  }
}
let closeInfo=(a)=>{
  if(a==1){

    dopolInfo.style.display='none'
    clsBtn.style.display='none'
    opBtn.style.display='block'
  }else if(a==2){
    dopolInfo2.style.display='none'
  clsBtn2.style.display='none'
  opBtn2.style.display='block'

  }

}







//likebar
// let likeCount = 0;
// let repostCount = 0;
// let commentCount = 0;

// document.getElementById('like-btn').addEventListener('click', function() {
//     likeCount++;
//     document.getElementById('like-count').textContent = likeCount;
// });

// document.getElementById('repost-btn').addEventListener('click', function() {
//     repostCount++;
//     document.getElementById('repost-count').textContent = repostCount;
// });

// document.getElementById('comment-btn').addEventListener('click', function() {
//     commentCount++;
//     document.getElementById('comment-count').textContent = commentCount;
// });