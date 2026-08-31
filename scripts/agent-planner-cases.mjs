/** Casos da suíte do planejador.
 *
 * Os grupos 1 a 4 são os exemplos das fichas de docs/agent-rules.docx — as
 * mesmas frases que a suíte determinística usa, para os dois caminhos serem
 * medidos contra o mesmo padrão. `expect` lista as intenções que DEVEM sair;
 * lista vazia significa «nenhuma ação».
 *
 * O grupo «geral» não está em ficha nenhuma: são perguntas comuns do dia a
 * dia, que existem aqui para medir excesso de disparo. É nelas que se vê se o
 * planejador atrapalha o uso normal — e, no modo «Alimentar resposta», se ele
 * pede `context` onde não precisa e atrasa a resposta à toa.
 */
export const CASES = [
  // ── Ficha 1 · search_book ────────────────────────────────────────────────
  {
    ficha: 1,
    q: "localize a palavra “consciex” nos livros",
    expect: ["search_book"],
    term: "consciex",
  },
  { ficha: 1, q: "Busque o termo tenepes", expect: ["search_book", "search_verbete"] },
  {
    ficha: 1,
    q: "buscar a expressão “dupla evolutiva”",
    expect: ["search_book", "search_verbete"],
  },
  { ficha: 1, q: "onde aparece a palavra holopensene?", expect: ["search_book", "search_verbete"] },
  {
    ficha: 1,
    q: "Encontre citações sobre “autopesquisa”",
    expect: ["search_book", "search_verbete"],
  },
  // Controle: neologismo do corpus não pode virar palavra comum parecida.
  {
    ficha: 1,
    q: "cite trechos com a palavra invéxis",
    expect: ["search_book", "search_verbete"],
    term: "invéxis",
  },
  { ficha: 1, q: "em que páginas aparece o termo “Waldo”", expect: ["search_book"] },
  {
    ficha: 1,
    q: "Em quais obras de Waldo Vieira aparece o vocábulo autorrevezamento?",
    expect: ["search_book"],
  },
  { ficha: 1, q: "Buscar a tenepes no livro Projeciologia", expect: ["search_book"], book: "PROJ" },
  { ficha: 1, q: "buscar Monja no léxico de ortopensatas", expect: ["search_book"], book: "LO" },
  { ficha: 1, q: "localize “conscin” no LO", expect: ["search_book"], book: "LO" },
  { ficha: 1, q: "find the word “consciousness” in the books", expect: ["search_book"] },
  {
    ficha: 1,
    q: "where does the expression “holosoma” appear?",
    expect: ["search_book", "search_verbete"],
  },
  // Grafia errada: a busca é literal, então o termo tem de sair corrigido.
  { ficha: 1, q: "busque trnnsmentor nos livros", expect: ["search_book"], term: "Transmentor" },
  {
    ficha: 2,
    q: "onde aparece holopnsene nos verbetes?",
    expect: ["search_verbete"],
    term: "holopensene",
  },
  { ficha: 1, q: "O que é a Conscienciologia?", expect: [] },
  { ficha: 1, q: "Explique o conceito de holopensene", expect: [] },
  { ficha: 1, q: "Como posso melhorar minha tenepes no dia a dia?", expect: [] },
  { ficha: 1, q: "Quero pesquisar mais sobre evolução da consciência", expect: [] },
  { ficha: 1, q: "Me fale sobre o livro Projeciologia", expect: [] },
  { ficha: 1, q: "Qual a diferença entre projeção e desdobramento?", expect: [] },
  { ficha: 1, q: "Preciso de ajuda para encontrar meu caminho evolutivo", expect: [] },
  { ficha: 1, q: "O que é a autopesquisa na prática cotidiana?", expect: [] },

  // ── Ficha 2 · search_verbete ─────────────────────────────────────────────
  { ficha: 2, q: "localize a palavra “consciex” nos verbetes", expect: ["search_verbete"] },
  { ficha: 2, q: "Busque verbetes sobre “tenepes”", expect: ["search_verbete"] },
  { ficha: 2, q: "verbetes com o título “tenepes”", expect: ["search_verbete"], field: "titulo" },
  { ficha: 2, q: "onde aparece a palavra holopensene nos verbetes?", expect: ["search_verbete"] },
  {
    ficha: 2,
    q: "Encontre frase enfática sobre “tenepes” nos verbetes",
    expect: ["search_verbete"],
  },
  { ficha: 2, q: "em quais verbetes aparece “waldo”?", expect: ["search_verbete"] },
  {
    ficha: 2,
    // O term é o TÍTULO; o autor é a resposta, não o campo de busca.
    q: "Quem é o autor do verbete “Sursum Conscientia”?",
    expect: ["search_verbete"],
    field: "titulo",
  },
  {
    ficha: 2,
    q: "Que verbetes são da especialidade “Evoluciologia”?",
    expect: ["search_verbete"],
    field: "especialidade",
  },
  {
    ficha: 2,
    q: "que verbetes o Waldo Vieira escreveu?",
    expect: ["search_verbete"],
    field: "autor",
  },
  { ficha: 2, q: "Discuta o verbete “Sursum Conscientia”", expect: [] },
  { ficha: 2, q: "Sobre o que o verbete “Sursum Conscientia” fala?", expect: [] },
  { ficha: 2, q: "Resuma o verbete “Sursum Conscientia”", expect: [] },
  {
    ficha: 2,
    q: "Compara os verbetes “Sursum Conscientia” e “Abertismo Consciencial”",
    expect: [],
  },

  // ── Ficha 3 · bibliografia_livros ────────────────────────────────────────
  {
    ficha: 3,
    q: "Qual é a bibliografia para o livro Manual da Tenepes?",
    expect: ["bibliografia_livros"],
  },
  { ficha: 3, q: "Me dê a bibliografia do livro Nossa Evolução.", expect: ["bibliografia_livros"] },
  { ficha: 3, q: "Como citar o livro “700 Experimentos”?", expect: ["bibliografia_livros"] },
  { ficha: 3, q: "BEE para o livro “Projeciologia”.", expect: ["bibliografia_livros"] },
  { ficha: 3, q: "Livro Temas da Conscienciologia.", expect: ["bibliografia_livros"] },
  { ficha: 3, q: "Citar o Léxico de Ortopensatas.", expect: ["bibliografia_livros"] },
  {
    ficha: 3,
    q: "Como citar os livros da Conscienciologia ou do Waldo?",
    expect: ["bibliografia_livros"],
  },
  { ficha: 3, q: "Bibliografia obras Waldo Vieira", expect: ["bibliografia_livros"] },
  { ficha: 3, q: "Buscar a tenepes no livro Projeciologia", expect: ["search_book"] },
  { ficha: 3, q: "O livro Manual da Tenepes fala sobre o que?", expect: [] },
  { ficha: 3, q: "Onde encontro o livro Conscienciograma?", expect: [] },

  // ── Ficha 4 · consulta_dicionarios ───────────────────────────────────────
  { ficha: 4, q: "qual o significado da palavra “altruísmo”?", expect: ["consulta_dicionarios"] },
  { ficha: 4, q: "qual a etimologia da palavra “ascender”?", expect: ["consulta_dicionarios"] },
  { ficha: 4, q: "liste sinônimos da palavra “sabedoria”", expect: ["consulta_dicionarios"] },
  { ficha: 4, q: "o que significa “sobrepairar”?", expect: ["consulta_dicionarios"] },
  {
    ficha: 4,
    q: "Em que áreas ou especialidades o termo “cérebro” é usado?",
    expect: ["consulta_dicionarios"],
  },
  {
    ficha: 4,
    q: "Qual a diferença ou desambiguação entre “amor” e “fraternidade”?",
    expect: ["consulta_dicionarios"],
  },
  { ficha: 4, q: "O que é “Cosmoética”?", expect: [] },
  { ficha: 4, q: "Liste sinônimos de “Pensene”", expect: [] },
  { ficha: 4, q: "Faça um cotejo entre “Cosmoética” e “Paradireito”", expect: [] },
  { ficha: 4, q: "Qual a diferença entre “Cosmovisão” e “Cosmoconsciência”", expect: [] },

  // ── Ficha 5 · encyclossapiens ────────────────────────────────────────────
  { ficha: 5, q: "quais os critérios de escrita do verbete?", expect: ["encyclossapiens"] },
  { ficha: 5, q: "como aplicar ao texto a forma dos verbetes?", expect: ["encyclossapiens"] },
  { ficha: 5, q: "peço para ajustar meu texto à forma dos verbetes", expect: ["encyclossapiens"] },
  { ficha: 5, q: "quais são as diretrizes dos verbetes da Enciclopédia?", expect: ["encyclossapiens"] },
  { ficha: 5, q: "o que é a Encyclossapiens?", expect: ["encyclossapiens"] },

  // ── Ficha 6 · acervo_icge ────────────────────────────────────────────────
  { ficha: 6, q: "como é organizado o acervo da Conscienciologia?", expect: ["acervo_icge"] },
  { ficha: 6, q: "onde fica o acervo histórico e a holoteca?", expect: ["acervo_icge"] },
  { ficha: 6, q: "quais artefatos fazem parte do acervo?", expect: ["acervo_icge"] },
  { ficha: 6, q: "informações sobre a conservação do acervo documental", expect: ["acervo_icge"] },

  // ── Geral · uso comum, nenhuma ação esperada ─────────────────────────────
  { ficha: "geral", q: "Como iniciar a prática da tenepes?", expect: [] },
  { ficha: "geral", q: "Explique o paradigma consciencial em termos simples.", expect: [] },
  { ficha: "geral", q: "Qual a relação entre cosmoética e evolução consciencial?", expect: [] },
  { ficha: "geral", q: "Resuma a teoria da seriéxis para quem nunca ouviu falar.", expect: [] },
  { ficha: "geral", q: "Quais são os atributos do Homo sapiens serenissimus?", expect: [] },
  { ficha: "geral", q: "Como identifico meu curso intermissivo?", expect: [] },
  { ficha: "geral", q: "Você pode me ajudar a entender a proéxis?", expect: [] },
  { ficha: "geral", q: "Faça um resumo do que conversamos até aqui.", expect: [] },
  // Único caso sem ação em que responder direto é o certo: não pede conteúdo.
  { ficha: "geral", q: "Boa noite! Tudo bem com você?", expect: [], mode: "direct" },
  { ficha: "geral", q: "Escreva um parágrafo sobre autoconhecimento evolutivo.", expect: [] },
];
