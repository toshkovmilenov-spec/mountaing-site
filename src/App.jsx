import { useEffect, useMemo, useState } from 'react';

const initialAuthForm = { username: '', password: '' };
const initialPostForm = { title: '', content: '', category: 'Пътека', placeId: '' };
const initialPlaceForm = { name: '', mountain: '', description: '' };
const initialUpdateForm = { content: '', status: 'Информация' };

async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('planinski-token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(endpoint, { ...options, headers });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Възникна неочаквана грешка.');
  return payload;
}

function formatDate(dateValue) {
  if (!dateValue) return '';
  return new Intl.DateTimeFormat('bg-BG', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${dateValue.replace(' ', 'T')}Z`));
}

function App() {
  const [user, setUser] = useState(null);
  const [activeSection, setActiveSection] = useState('начало');
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState(initialAuthForm);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [globalError, setGlobalError] = useState('');
  const [search, setSearch] = useState('');
  const [places, setPlaces] = useState([]);
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState({ places: 0, posts: 0, updates: 0, mountains: 0 });
  const [selectedPlace, setSelectedPlace] = useState(null);
  const [placeUpdates, setPlaceUpdates] = useState([]);
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [isPlaceModalOpen, setIsPlaceModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [editingUpdate, setEditingUpdate] = useState(null);
  const [postForm, setPostForm] = useState(initialPostForm);
  const [placeForm, setPlaceForm] = useState(initialPlaceForm);
  const [updateForm, setUpdateForm] = useState(initialUpdateForm);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function loadData(currentSearch = '') {
    setIsLoading(true);
    try {
      const [placesResponse, postsResponse, statsResponse] = await Promise.all([
        apiRequest(`/api/places?search=${encodeURIComponent(currentSearch)}`),
        apiRequest(`/api/posts?search=${encodeURIComponent(currentSearch)}`),
        apiRequest('/api/stats')
      ]);
      setPlaces(placesResponse.places);
      setPosts(postsResponse.posts);
      setStats(statsResponse.stats);
      if (selectedPlace) {
        const refreshedPlace = placesResponse.places.find((place) => place.id === selectedPlace.id);
        if (refreshedPlace) setSelectedPlace(refreshedPlace);
      }
    } catch (error) {
      setGlobalError(error.message);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const token = localStorage.getItem('planinski-token');
    if (token) apiRequest('/api/me').then((result) => setUser(result.user)).catch(() => localStorage.removeItem('planinski-token'));
    loadData();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => loadData(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!selectedPlace) { setPlaceUpdates([]); return; }
    apiRequest(`/api/places/${selectedPlace.id}/updates`).then((result) => setPlaceUpdates(result.updates)).catch((error) => setGlobalError(error.message));
  }, [selectedPlace?.id]);

  function navigate(section) {
    setActiveSection(section);
    if (section !== 'място') setSelectedPlace(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function openAuth(mode = 'login') { setAuthMode(mode); setAuthError(''); setIsAuthOpen(true); }

  function logOut() {
    localStorage.removeItem('planinski-token');
    setUser(null);
    setActiveSection('начало');
  }

  async function submitAuth(event) {
    event.preventDefault();
    setAuthError('');
    setIsSubmitting(true);
    try {
      const result = await apiRequest(`/api/auth/${authMode}`, { method: 'POST', body: JSON.stringify(authForm) });
      localStorage.setItem('planinski-token', result.token);
      setUser(result.user);
      setAuthForm(initialAuthForm);
      setIsAuthOpen(false);
    } catch (error) { setAuthError(error.message); } finally { setIsSubmitting(false); }
  }

  function requireUser(action) { if (user) action(); else openAuth('login'); }

  function openPostModal(post = null) {
    requireUser(() => {
      setEditingPost(post);
      setPostForm(post ? { title: post.title, content: post.content, category: post.category, placeId: post.place_id || '' } : { ...initialPostForm, placeId: selectedPlace?.id || '' });
      setIsPostModalOpen(true);
    });
  }

  async function savePost(event) {
    event.preventDefault(); setIsSubmitting(true); setGlobalError('');
    try {
      const endpoint = editingPost ? `/api/posts/${editingPost.id}` : '/api/posts';
      await apiRequest(endpoint, { method: editingPost ? 'PUT' : 'POST', body: JSON.stringify(postForm) });
      setIsPostModalOpen(false); setEditingPost(null); setPostForm(initialPostForm); await loadData(search);
    } catch (error) { setGlobalError(error.message); } finally { setIsSubmitting(false); }
  }

  async function removePost(post) {
    if (!window.confirm('Да изтрием ли тази публикация?')) return;
    try { await apiRequest(`/api/posts/${post.id}`, { method: 'DELETE' }); await loadData(search); } catch (error) { setGlobalError(error.message); }
  }

  async function savePlace(event) {
    event.preventDefault(); setIsSubmitting(true); setGlobalError('');
    try { await apiRequest('/api/places', { method: 'POST', body: JSON.stringify(placeForm) }); setIsPlaceModalOpen(false); setPlaceForm(initialPlaceForm); await loadData(search); } catch (error) { setGlobalError(error.message); } finally { setIsSubmitting(false); }
  }

  function openUpdateModal(update = null) {
    requireUser(() => { setEditingUpdate(update); setUpdateForm(update ? { content: update.content, status: update.status } : initialUpdateForm); setIsUpdateModalOpen(true); });
  }

  async function saveUpdate(event) {
    event.preventDefault(); setIsSubmitting(true); setGlobalError('');
    try {
      const endpoint = editingUpdate ? `/api/updates/${editingUpdate.id}` : `/api/places/${selectedPlace.id}/updates`;
      await apiRequest(endpoint, { method: editingUpdate ? 'PUT' : 'POST', body: JSON.stringify(updateForm) });
      setIsUpdateModalOpen(false); setEditingUpdate(null); setUpdateForm(initialUpdateForm);
      const result = await apiRequest(`/api/places/${selectedPlace.id}/updates`); setPlaceUpdates(result.updates); await loadData(search);
    } catch (error) { setGlobalError(error.message); } finally { setIsSubmitting(false); }
  }

  async function removeUpdate(update) {
    if (!window.confirm('Да изтрием ли това обновяване?')) return;
    try { await apiRequest(`/api/updates/${update.id}`, { method: 'DELETE' }); setPlaceUpdates((items) => items.filter((item) => item.id !== update.id)); await loadData(search); } catch (error) { setGlobalError(error.message); }
  }

  const latestPosts = useMemo(() => posts.slice(0, 4), [posts]);
  const visiblePosts = activeSection === 'моите' && user ? posts.filter((post) => post.author_id === user.id) : posts;

  return <div className="min-h-screen bg-sand text-ink">
    <Header user={user} activeSection={activeSection} navigate={navigate} openAuth={openAuth} logOut={logOut} search={search} setSearch={setSearch} />
    {globalError && <div className="fixed right-4 top-20 z-40 max-w-sm rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800 shadow-soft"><i className="bi bi-exclamation-circle mr-2" />{globalError}<button onClick={() => setGlobalError('')} className="ml-3">×</button></div>}
    <main className="mx-auto max-w-7xl px-4 pb-12 pt-6 sm:px-6 lg:px-8 mobile-safe-bottom">
      {activeSection === 'начало' && <HomeView stats={stats} latestPosts={latestPosts} navigate={navigate} openPostModal={() => openPostModal()} openAuth={openAuth} isLoading={isLoading} />}
      {activeSection === 'маршрути' && <PlacesView places={places} search={search} selectPlace={(place) => { setSelectedPlace(place); setActiveSection('място'); }} openPlaceModal={() => requireUser(() => setIsPlaceModalOpen(true))} isLoading={isLoading} />}
      {activeSection === 'публикации' && <PostsView posts={visiblePosts} user={user} search={search} openPostModal={openPostModal} editPost={openPostModal} removePost={removePost} isLoading={isLoading} />}
      {activeSection === 'моите' && <PostsView posts={visiblePosts} user={user} search={search} openPostModal={openPostModal} editPost={openPostModal} removePost={removePost} isLoading={isLoading} personal />}
      {activeSection === 'място' && selectedPlace && <PlaceDetail place={selectedPlace} updates={placeUpdates} user={user} goBack={() => navigate('маршрути')} openUpdateModal={openUpdateModal} editUpdate={openUpdateModal} removeUpdate={removeUpdate} />}
      {activeSection === 'място' && !selectedPlace && <EmptyState icon="bi-pin-map" title="Изберете място" text="Потърсете маршрут или място, за да видите подробностите." action={() => navigate('маршрути')} actionLabel="Разгледай маршрути" />}
    </main>
    <MobileNav activeSection={activeSection} navigate={navigate} />
    {isAuthOpen && <Modal title={authMode === 'login' ? 'Добре дошли обратно' : 'Създай профил'} onClose={() => setIsAuthOpen(false)}><AuthForm mode={authMode} setMode={setAuthMode} form={authForm} setForm={setAuthForm} onSubmit={submitAuth} error={authError} isSubmitting={isSubmitting} /></Modal>}
    {isPostModalOpen && <Modal title={editingPost ? 'Редактирай публикация' : 'Нова публикация'} onClose={() => setIsPostModalOpen(false)}><PostForm form={postForm} setForm={setPostForm} places={places} onSubmit={savePost} isSubmitting={isSubmitting} /></Modal>}
    {isPlaceModalOpen && <Modal title="Добави ново място" onClose={() => setIsPlaceModalOpen(false)}><PlaceForm form={placeForm} setForm={setPlaceForm} onSubmit={savePlace} isSubmitting={isSubmitting} /></Modal>}
    {isUpdateModalOpen && <Modal title={editingUpdate ? 'Редактирай обновяване' : `Обновяване за ${selectedPlace?.name}`} onClose={() => setIsUpdateModalOpen(false)}><UpdateForm form={updateForm} setForm={setUpdateForm} onSubmit={saveUpdate} isSubmitting={isSubmitting} /></Modal>}
  </div>;
}

function Header({ user, activeSection, navigate, openAuth, logOut, search, setSearch }) {
  return <header className="sticky top-0 z-30 border-b border-olive-100/80 bg-sand/95 backdrop-blur"><div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
    <button onClick={() => navigate('начало')} className="flex shrink-0 items-center gap-2 text-left"><span className="grid h-10 w-10 place-items-center rounded-xl bg-olive-600 text-xl text-white shadow-sm"><i className="bi bi-tree-fill" /></span><span className="hidden text-sm font-bold leading-tight text-olive-900 sm:block">Планински<br />информатор</span></button>
    <nav className="ml-5 hidden items-center gap-1 lg:flex">{[['начало', 'Начало'], ['маршрути', 'Маршрути'], ['публикации', 'Публикации']].map(([value, label]) => <button key={value} onClick={() => navigate(value)} className={`rounded-xl px-3 py-2 text-sm font-bold transition ${activeSection === value ? 'bg-olive-100 text-olive-800' : 'text-slate-500 hover:bg-olive-50 hover:text-olive-800'}`}>{label}</button>)}</nav>
    <div className="relative ml-auto hidden max-w-xs flex-1 md:block"><i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Търси място или тема..." className="w-full rounded-xl border border-olive-100 bg-white py-2.5 pl-9 pr-3 text-xs outline-none ring-olive-200 transition focus:ring-2" /></div>
    {user ? <div className="flex items-center gap-2"><button onClick={() => navigate('моите')} className="hidden items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-olive-800 hover:bg-olive-50 sm:flex"><span className="grid h-8 w-8 place-items-center rounded-full bg-olive-200 text-xs"><i className="bi bi-person-fill" /></span>{user.username}</button><button onClick={logOut} className="rounded-xl p-2 text-slate-500 hover:bg-olive-50 hover:text-olive-800" title="Изход"><i className="bi bi-box-arrow-right text-lg" /></button></div> : <button onClick={() => openAuth('login')} className="rounded-xl bg-olive-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-olive-700">Вход</button>}
  </div><div className="px-4 pb-3 md:hidden"><div className="relative"><i className="bi bi-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Търси място или тема..." className="w-full rounded-xl border border-olive-100 bg-white py-2.5 pl-9 pr-3 text-xs outline-none ring-olive-200 focus:ring-2" /></div></div></header>;
}

function HomeView({ stats, latestPosts, navigate, openPostModal, openAuth, isLoading }) {
  return <div className="space-y-7"><section className="leaf-pattern relative overflow-hidden rounded-3xl bg-olive-700 px-6 py-10 text-white shadow-soft sm:px-12 sm:py-14"><div className="relative max-w-2xl"><p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-olive-200">Общност за безопасни преходи</p><h1 className="max-w-xl text-3xl font-bold leading-tight sm:text-5xl">Планината говори. <span className="text-olive-200">Нека слушаме.</span></h1><p className="mt-5 max-w-xl text-sm leading-7 text-olive-100 sm:text-base">Актуални сигнали, идеи и проверена информация за маршрутите в българските планини — от хора, които са били там.</p><div className="mt-7 flex flex-wrap gap-3"><button onClick={() => navigate('маршрути')} className="rounded-xl bg-white px-5 py-3 text-xs font-bold text-olive-800 shadow-sm transition hover:bg-olive-50">Разгледай маршрутите <i className="bi bi-arrow-right ml-2" /></button><button onClick={() => openAuth('register')} className="rounded-xl border border-olive-300 px-5 py-3 text-xs font-bold text-white hover:bg-olive-600">Присъедини се</button></div></div><i className="bi bi-compass absolute -bottom-10 right-6 text-[190px] text-olive-600/60 sm:right-20" /></section>
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">{[['bi-pin-map', stats.places, 'места'], ['bi-signpost-2', stats.posts, 'публикации'], ['bi-chat-square-text', stats.updates, 'обновявания'], ['bi-bar-chart-steps', stats.mountains, 'планини']].map(([icon, value, label]) => <div key={label} className="rounded-2xl border border-olive-100 bg-white p-4 shadow-sm"><i className={`${icon} text-xl text-olive-600`} /><p className="mt-3 text-2xl font-bold text-olive-900">{isLoading ? '—' : value}</p><p className="text-xs font-semibold text-slate-400">{label}</p></div>)}</section>
    <section className="grid gap-6 lg:grid-cols-[1fr_340px]"><div className="rounded-2xl border border-olive-100 bg-white p-5 shadow-sm"><div className="mb-5 flex items-center justify-between"><div><p className="text-xs font-bold uppercase tracking-wider text-olive-600">Последно от общността</p><h2 className="mt-1 text-xl font-bold text-olive-900">Нови сигнали</h2></div><button onClick={() => navigate('публикации')} className="text-xs font-bold text-olive-600 hover:text-olive-800">Виж всички <i className="bi bi-arrow-up-right ml-1" /></button></div>{latestPosts.length ? <div className="divide-y divide-olive-50">{latestPosts.map((post) => <PostRow key={post.id} post={post} />)}</div> : <EmptyState icon="bi-chat-square" title="Все още няма публикации" text="Сподели първата полезна информация." action={openPostModal} actionLabel="Добави публикация" />}</div><div className="rounded-2xl bg-olive-100/70 p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-xl text-olive-600"><i className="bi bi-shield-check" /></span><h3 className="mt-5 text-lg font-bold text-olive-900">Бъди полезен в планината</h3><p className="mt-2 text-sm leading-6 text-olive-800/80">Видя ли опасен участък или почистена пътека? Сподели го с хората, които ще минат след теб.</p><button onClick={openPostModal} className="mt-5 rounded-xl bg-olive-700 px-4 py-3 text-xs font-bold text-white hover:bg-olive-800">Добави информация <i className="bi bi-plus-lg ml-2" /></button></div></section>
  </div>;
}

function PlacesView({ places, search, selectPlace, openPlaceModal, isLoading }) {
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-wider text-olive-600">Изследвай</p><h1 className="mt-1 text-3xl font-bold text-olive-900">Маршрути и места</h1><p className="mt-2 max-w-xl text-sm text-slate-500">Избери място, за да видиш последните сигнали от хората по пътеката.</p></div><button onClick={openPlaceModal} className="rounded-xl bg-olive-600 px-4 py-3 text-xs font-bold text-white hover:bg-olive-700"><i className="bi bi-plus-lg mr-2" />Добави място</button></div>{search && <p className="text-xs font-semibold text-slate-500">Резултати за „{search}“: {places.length}</p>}<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{isLoading ? [1, 2, 3].map((item) => <div key={item} className="h-48 animate-pulse rounded-2xl bg-olive-100" />) : places.map((place) => <button key={place.id} onClick={() => selectPlace(place)} className="group rounded-2xl border border-olive-100 bg-white p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-olive-300 hover:shadow-soft"><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-olive-100 text-lg text-olive-700"><i className="bi bi-pin-map-fill" /></span><span className="rounded-lg bg-sand px-2 py-1 text-[10px] font-bold text-slate-500">{place.mountain}</span></div><h3 className="mt-5 text-base font-bold text-olive-900 group-hover:text-olive-600">{place.name}</h3><p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{place.description}</p><div className="mt-5 flex items-center justify-between border-t border-olive-50 pt-3 text-[10px] font-bold text-slate-400"><span><i className="bi bi-chat-left-text mr-1" />{place.update_count || 0} обновявания</span><i className="bi bi-arrow-up-right text-base text-olive-500" /></div></button>)}{!isLoading && !places.length && <div className="col-span-full"><EmptyState icon="bi-search" title="Няма намерени места" text="Пробвай с друго име или добави ново място." action={openPlaceModal} actionLabel="Добави място" /></div>}</div></div>;
}

function PostsView({ posts, user, openPostModal, editPost, removePost, isLoading, personal }) {
  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-bold uppercase tracking-wider text-olive-600">Гласът на планината</p><h1 className="mt-1 text-3xl font-bold text-olive-900">{personal ? 'Моите публикации' : 'Всички публикации'}</h1><p className="mt-2 text-sm text-slate-500">Споделяй актуална, практична информация за следващия преход.</p></div><button onClick={() => openPostModal()} className="rounded-xl bg-olive-600 px-4 py-3 text-xs font-bold text-white hover:bg-olive-700"><i className="bi bi-plus-lg mr-2" />Нова публикация</button></div><div className="grid gap-4 md:grid-cols-2">{isLoading ? [1, 2, 3, 4].map((item) => <div key={item} className="h-52 animate-pulse rounded-2xl bg-olive-100" />) : posts.map((post) => <PostCard key={post.id} post={post} user={user} onEdit={editPost} onDelete={removePost} />)}{!isLoading && !posts.length && <div className="col-span-full"><EmptyState icon="bi-journal-text" title={personal ? 'Още нямаш публикации' : 'Няма резултати'} text={personal ? 'Добави първия си сигнал за общността.' : 'Опитай с друга дума за търсене.'} action={() => openPostModal()} actionLabel="Напиши публикация" /></div>}</div></div>;
}

function PlaceDetail({ place, updates, user, goBack, openUpdateModal, editUpdate, removeUpdate }) {
  return <div className="space-y-5"><button onClick={goBack} className="text-xs font-bold text-olive-600 hover:text-olive-800"><i className="bi bi-arrow-left mr-2" />Обратно към маршрутите</button><section className="rounded-3xl bg-olive-700 p-6 text-white shadow-soft sm:p-9"><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><span className="rounded-lg bg-olive-600 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-olive-100">{place.mountain}</span><h1 className="mt-5 text-3xl font-bold sm:text-4xl">{place.name}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-olive-100">{place.description}</p></div><i className="bi bi-pin-map text-6xl text-olive-400/60" /></div></section><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-wider text-olive-600">Последни наблюдения</p><h2 className="mt-1 text-2xl font-bold text-olive-900">Какво се случва тук</h2></div><button onClick={() => openUpdateModal()} className="rounded-xl bg-olive-600 px-4 py-3 text-xs font-bold text-white hover:bg-olive-700"><i className="bi bi-plus-lg mr-2" />Добави обновяване</button></div><div className="space-y-3">{updates.length ? updates.map((update) => <div key={update.id} className="rounded-2xl border border-olive-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-olive-100 text-sm text-olive-700"><i className="bi bi-person-fill" /></span><div><p className="text-xs font-bold text-olive-900">{update.author_name}</p><p className="text-[10px] text-slate-400">{formatDate(update.created_at)}</p></div></div><span className="rounded-lg bg-olive-50 px-2 py-1 text-[10px] font-bold text-olive-700">{update.status}</span></div><p className="mt-4 text-sm leading-6 text-slate-600">{update.content}</p>{user?.id === update.author_id && <div className="mt-4 flex gap-3 border-t border-olive-50 pt-3 text-[11px] font-bold"><button onClick={() => editUpdate(update)} className="text-olive-600 hover:text-olive-800"><i className="bi bi-pencil mr-1" />Редактирай</button><button onClick={() => removeUpdate(update)} className="text-red-500 hover:text-red-700"><i className="bi bi-trash mr-1" />Изтрий</button></div>}</div>) : <EmptyState icon="bi-chat-square-heart" title="Няма обновявания" text="Бъди първият, който ще сподели състоянието на мястото." action={() => openUpdateModal()} actionLabel="Сподели наблюдение" />}</div></div>;
}

function PostRow({ post }) { return <div className="flex gap-3 py-4"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-olive-100 text-olive-600"><i className="bi bi-signpost-2" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-bold text-olive-900">{post.title}</h3><span className="rounded bg-olive-50 px-1.5 py-0.5 text-[9px] font-bold text-olive-700">{post.category}</span></div><p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{post.content}</p><p className="mt-2 text-[10px] font-semibold text-slate-400">{post.place_name || 'Обща информация'} · {post.author_name} · {formatDate(post.created_at)}</p></div></div>; }

function PostCard({ post, user, onEdit, onDelete }) { return <article className="rounded-2xl border border-olive-100 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><span className="rounded-lg bg-olive-50 px-2 py-1 text-[10px] font-bold text-olive-700">{post.category}</span>{user?.id === post.author_id && <div className="flex gap-1"><button onClick={() => onEdit(post)} className="rounded-lg p-2 text-slate-400 hover:bg-olive-50 hover:text-olive-600"><i className="bi bi-pencil" /></button><button onClick={() => onDelete(post)} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><i className="bi bi-trash" /></button></div>}</div><h2 className="mt-4 text-lg font-bold text-olive-900">{post.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{post.content}</p><div className="mt-5 flex flex-wrap items-center gap-2 border-t border-olive-50 pt-4 text-[10px] font-bold text-slate-400"><span><i className="bi bi-person mr-1" />{post.author_name}</span><span>·</span><span>{post.place_name || 'Обща информация'}</span><span>·</span><span>{formatDate(post.created_at)}</span></div></article>; }

function AuthForm({ mode, setMode, form, setForm, onSubmit, error, isSubmitting }) { return <form onSubmit={onSubmit} className="space-y-4"><div className="flex rounded-xl bg-sand p-1"><button type="button" onClick={() => setMode('login')} className={`flex-1 rounded-lg py-2 text-xs font-bold ${mode === 'login' ? 'bg-white text-olive-700 shadow-sm' : 'text-slate-400'}`}>Вход</button><button type="button" onClick={() => setMode('register')} className={`flex-1 rounded-lg py-2 text-xs font-bold ${mode === 'register' ? 'bg-white text-olive-700 shadow-sm' : 'text-slate-400'}`}>Регистрация</button></div><Field label="Потребителско име" value={form.username} onChange={(value) => setForm({ ...form, username: value })} placeholder="например: планинар" icon="bi-person" /><Field label="Парола" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} placeholder="Минимум 6 символа" icon="bi-lock" />{error && <p className="rounded-xl bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}<button disabled={isSubmitting} className="w-full rounded-xl bg-olive-600 py-3 text-xs font-bold text-white hover:bg-olive-700 disabled:opacity-50">{isSubmitting ? 'Изчакай...' : mode === 'login' ? 'Влез в профила' : 'Създай профил'}</button></form>; }

function PostForm({ form, setForm, places, onSubmit, isSubmitting }) { return <form onSubmit={onSubmit} className="space-y-4"><Field label="Заглавие" value={form.title} onChange={(value) => setForm({ ...form, title: value })} placeholder="Какво забеляза?" /><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Категория" value={form.category} onChange={(value) => setForm({ ...form, category: value })} options={['Пътека', 'Безопасност', 'Инфраструктура', 'Време']} /><SelectField label="Място" value={form.placeId} onChange={(value) => setForm({ ...form, placeId: value })} options={places.map((place) => ({ value: place.id, label: place.name }))} emptyLabel="Обща информация" /></div><TextArea label="Описание" value={form.content} onChange={(value) => setForm({ ...form, content: value })} placeholder="Опиши състоянието на маршрута..." /><SubmitButton isSubmitting={isSubmitting} label="Публикувай" /></form>; }
function PlaceForm({ form, setForm, onSubmit, isSubmitting }) { return <form onSubmit={onSubmit} className="space-y-4"><Field label="Име на мястото" value={form.name} onChange={(value) => setForm({ ...form, name: value })} placeholder="например: Хижа Рай" /><Field label="Планина" value={form.mountain} onChange={(value) => setForm({ ...form, mountain: value })} placeholder="например: Стара планина" /><TextArea label="Кратко описание" value={form.description} onChange={(value) => setForm({ ...form, description: value })} placeholder="Какво трябва да знаят посетителите?" /><SubmitButton isSubmitting={isSubmitting} label="Добави място" /></form>; }
function UpdateForm({ form, setForm, onSubmit, isSubmitting }) { return <form onSubmit={onSubmit} className="space-y-4"><SelectField label="Тип обновяване" value={form.status} onChange={(value) => setForm({ ...form, status: value })} options={['Информация', 'Добро състояние', 'Внимание', 'Опасност']} /><TextArea label="Какво се случва?" value={form.content} onChange={(value) => setForm({ ...form, content: value })} placeholder="Сподели актуално наблюдение от мястото..." /><SubmitButton isSubmitting={isSubmitting} label="Запази обновяването" /></form>; }
function Field({ label, value, onChange, placeholder, type = 'text', icon }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-olive-900">{label}</span><div className="relative">{icon && <i className={`bi ${icon} absolute left-3 top-1/2 -translate-y-1/2 text-slate-400`} />}<input required type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={`w-full rounded-xl border border-olive-100 bg-sand px-3 py-3 text-sm outline-none ring-olive-200 focus:ring-2 ${icon ? 'pl-9' : ''}`} /></div></label>; }
function TextArea({ label, value, onChange, placeholder }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-olive-900">{label}</span><textarea required rows="5" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full resize-none rounded-xl border border-olive-100 bg-sand px-3 py-3 text-sm outline-none ring-olive-200 focus:ring-2" /></label>; }
function SelectField({ label, value, onChange, options, emptyLabel }) { return <label className="block"><span className="mb-1.5 block text-xs font-bold text-olive-900">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-xl border border-olive-100 bg-sand px-3 py-3 text-sm outline-none ring-olive-200 focus:ring-2">{emptyLabel && <option value="">{emptyLabel}</option>}{options.map((option) => { const optionValue = typeof option === 'string' ? option : option.value; const optionLabel = typeof option === 'string' ? option : option.label; return <option key={optionValue} value={optionValue}>{optionLabel}</option>; })}</select></label>; }
function SubmitButton({ label, isSubmitting }) { return <button disabled={isSubmitting} className="w-full rounded-xl bg-olive-600 py-3 text-xs font-bold text-white hover:bg-olive-700 disabled:opacity-50">{isSubmitting ? 'Запазване...' : label}</button>; }
function Modal({ title, onClose, children }) { return <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl scrollbar-soft sm:p-8"><div className="mb-6 flex items-start justify-between"><h2 className="text-xl font-bold text-olive-900">{title}</h2><button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-sand hover:text-olive-800"><i className="bi bi-x-lg" /></button></div>{children}</div></div>; }
function EmptyState({ icon, title, text, action, actionLabel }) { return <div className="rounded-2xl border border-dashed border-olive-200 bg-white p-8 text-center"><i className={`bi ${icon} text-3xl text-olive-400`} /><h3 className="mt-3 text-sm font-bold text-olive-900">{title}</h3><p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">{text}</p>{action && <button onClick={action} className="mt-4 rounded-xl bg-olive-100 px-4 py-2.5 text-xs font-bold text-olive-800 hover:bg-olive-200">{actionLabel}</button>}</div>; }
function MobileNav({ activeSection, navigate }) { return <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-olive-100 bg-white/95 px-3 py-2 backdrop-blur lg:hidden"><div className="mx-auto flex max-w-md items-center justify-around">{[['начало', 'bi-house', 'Начало'], ['маршрути', 'bi-pin-map', 'Места'], ['публикации', 'bi-journal-text', 'Сигнали'], ['моите', 'bi-person', 'Профил']].map(([value, icon, label]) => <button key={value} onClick={() => navigate(value)} className={`flex min-w-[64px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[10px] font-bold ${activeSection === value ? 'bg-olive-100 text-olive-700' : 'text-slate-400'}`}><i className={`bi ${icon} text-lg`} />{label}</button>)}</div></nav>; }

export default App;
