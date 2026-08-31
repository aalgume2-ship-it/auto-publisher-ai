const products=[
{title:'ساعة ذكية Pro',category:'electronics',price:'299 ر.س',badge:'الأكثر طلبًا',desc:'شاشة واضحة وتصميم أنيق للاستخدام اليومي.',image:'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85'},
{title:'سماعة لاسلكية',category:'electronics',price:'189 ر.س',badge:'جديد',desc:'صوت متوازن وعلبة شحن صغيرة للاستخدام أثناء التنقل.',image:'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85'},
{title:'حقيبة يومية',category:'lifestyle',price:'159 ر.س',badge:'مختار',desc:'تصميم عملي بخامات بسيطة يناسب العمل والسفر القصير.',image:'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=900&q=85'},
{title:'مصباح مكتبي',category:'home',price:'129 ر.س',badge:'مميز',desc:'إضاءة هادئة ولمسة حديثة للمكتب أو طاولة القراءة.',image:'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=900&q=85'},
{title:'نظارة شمسية',category:'accessories',price:'119 ر.س',badge:'صيفي',desc:'إطار عصري خفيف مناسب للإطلالات اليومية.',image:'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&w=900&q=85'},
{title:'كاميرا فورية',category:'electronics',price:'399 ر.س',badge:'مميز',desc:'التقط اللحظة واحتفظ بها فورًا بتصميم كلاسيكي جميل.',image:'https://images.unsplash.com/photo-1452780212940-6f5c0d14d848?auto=format&fit=crop&w=900&q=85'},
{title:'زجاجة حرارية',category:'lifestyle',price:'89 ر.س',badge:'عملي',desc:'مناسبة للعمل والرياضة وتحافظ على المشروبات لوقت أطول.',image:'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=900&q=85'},
{title:'كرسي مكتبي مريح',category:'home',price:'549 ر.س',badge:'راحة',desc:'تصميم بسيط ومريح لمساحة عمل أكثر أناقة.',image:'https://images.unsplash.com/photo-1505797149-35ebcb05a6fd?auto=format&fit=crop&w=900&q=85'}
];

const labels={electronics:'إلكترونيات',lifestyle:'لايف ستايل',home:'المنزل',accessories:'إكسسوارات'};
const grid=document.getElementById('productGrid');
const search=document.getElementById('search');
const empty=document.getElementById('emptyState');
let selected='all';

function render(){
 const term=search.value.trim().toLowerCase();
 const filtered=products.filter(p=>(selected==='all'||p.category===selected)&&(`${p.title} ${p.desc}`.toLowerCase().includes(term)));
 grid.innerHTML=filtered.map((p,i)=>`<article class="product-card">
   <div class="product-image"><img src="${p.image}" alt="${p.title}" loading="lazy"></div>
   <div class="product-body">
    <div class="product-meta"><span class="badge">${p.badge}</span><span class="price">${p.price}</span></div>
    <h3 class="product-title">${p.title}</h3>
    <p class="product-desc">${p.desc}</p>
    <a class="product-cta" href="mailto:orders@example.com?subject=${encodeURIComponent('طلب منتج: '+p.title)}">اطلب المنتج</a>
   </div>
  </article>`).join('');
 empty.hidden=filtered.length!==0;
}

document.querySelectorAll('.category').forEach(btn=>btn.addEventListener('click',()=>{
 document.querySelectorAll('.category').forEach(b=>b.classList.remove('active'));
 btn.classList.add('active');
 selected=btn.dataset.filter;
 render();
}));
search.addEventListener('input',render);
render();
