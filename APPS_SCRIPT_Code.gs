// ============================================================
//  SISTEMA FINANCEIRO PESSOAL — Google Apps Script
//  Sincronização bidirecional com PWA
//  Versão: 2.0 — Produção
// ============================================================

// ── CONFIGURAÇÃO ─────────────────────────────────────────────
const SPREADSHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();
const PLANILHAS = {
  financeiro  : 'Financeiro',
  metas       : 'Metas',
  orcamentos  : 'Orcamentos',
  categorias  : 'Categorias',
  log         : 'Log'
};

// Cabeçalhos de cada planilha
const HEADERS = {
  financeiro  : ['id','tipo','categoria','descricao','valor','data','observacao','criacao'],
  metas       : ['id','titulo','valorObjetivo','valorAtual','prazo','descricao','criacao'],
  orcamentos  : ['id','categoria','limite','mes'],
  categorias  : ['id','nome'],
  log         : ['timestamp','acao','origem','detalhes']
};

// ── INICIALIZAÇÃO ─────────────────────────────────────────────
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('💰 Financeiro')
    .addItem('⚙️ Configurar Planilhas', 'configurarPlanilhas')
    .addItem('🔄 Recriar Cabeçalhos', 'recriarCabecalhos')
    .addItem('📋 Ver URL do Web App', 'mostrarURL')
    .addSeparator()
    .addItem('🗑️ Limpar Log', 'limparLog')
    .addToUi();
}

function configurarPlanilhas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  Object.entries(PLANILHAS).forEach(([chave, nome]) => {
    let sheet = ss.getSheetByName(nome);
    
    if (!sheet) {
      sheet = ss.insertSheet(nome);
      registrarLog('CRIACAO', 'Apps Script', `Planilha '${nome}' criada`);
    }
    
    // Garantir cabeçalhos
    const headers = HEADERS[chave];
    if (headers) {
      const range = sheet.getRange(1, 1, 1, headers.length);
      if (range.getValues()[0].join('') === '') {
        range.setValues([headers]);
        range.setFontWeight('bold');
        range.setBackground('#667eea');
        range.setFontColor('#ffffff');
        sheet.setFrozenRows(1);
      }
    }
  });
  
  // Formatar planilha Financeiro
  formatarPlanilhaFinanceiro();
  
  SpreadsheetApp.getUi().alert(
    '✅ Planilhas configuradas com sucesso!\n\n' +
    'Planilhas criadas:\n' +
    '• Financeiro\n• Metas\n• Orcamentos\n• Categorias\n• Log'
  );
}

function recriarCabecalhos() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.entries(PLANILHAS).forEach(([chave, nome]) => {
    const sheet = ss.getSheetByName(nome);
    if (!sheet) return;
    const headers = HEADERS[chave];
    if (!headers) return;
    const range = sheet.getRange(1, 1, 1, headers.length);
    range.setValues([headers]);
    range.setFontWeight('bold');
    range.setBackground('#667eea');
    range.setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  });
  SpreadsheetApp.getUi().alert('✅ Cabeçalhos recriados!');
}

function formatarPlanilhaFinanceiro() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PLANILHAS.financeiro);
  if (!sheet) return;
  
  // Largura das colunas
  sheet.setColumnWidth(1, 120); // id
  sheet.setColumnWidth(2, 100); // tipo
  sheet.setColumnWidth(3, 140); // categoria
  sheet.setColumnWidth(4, 220); // descrição
  sheet.setColumnWidth(5, 110); // valor
  sheet.setColumnWidth(6, 100); // data
  sheet.setColumnWidth(7, 180); // observação
  sheet.setColumnWidth(8, 160); // criação
}

function mostrarURL() {
  const url = ScriptApp.getService().getUrl();
  SpreadsheetApp.getUi().alert(
    '🔗 URL do Web App:\n\n' + url + '\n\n' +
    'Cole essa URL no campo "Sincronização" do app PWA.'
  );
}

// ── ENTRY POINTS HTTP ─────────────────────────────────────────

/**
 * GET — Carrega dados do Sheets para o app
 * Chamadas: ?action=load | ?action=load&tabela=financeiro
 */
function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || 'load';
    const tabela = params.tabela || null;
    
    registrarLog('GET', params.origem || 'PWA', `action=${action}, tabela=${tabela||'todas'}`);
    
    let payload = {};
    
    if (action === 'ping') {
      payload = { ok: true, timestamp: new Date().toISOString() };
    } else if (action === 'load') {
      payload = tabela ? carregarTabela(tabela) : carregarTudo();
    } else if (action === 'stats') {
      payload = gerarEstatisticas();
    }
    
    return responderJSON({ success: true, ...payload });
    
  } catch (err) {
    registrarLog('ERRO_GET', 'Sistema', err.message);
    return responderJSON({ success: false, error: err.message }, 500);
  }
}

/**
 * POST — Recebe dados do app e salva no Sheets
 * Body: { action, financeiro?, metas?, orcamentos?, categorias? }
 */
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || 'save';
    
    registrarLog('POST', body.origem || 'PWA', `action=${action}`);
    
    let payload = {};
    
    if (action === 'save') {
      // Salvar todas as tabelas recebidas
      const resultado = {};
      if (body.financeiro  !== undefined) resultado.financeiro  = salvarTabela('financeiro',  body.financeiro);
      if (body.metas       !== undefined) resultado.metas       = salvarTabela('metas',       body.metas);
      if (body.orcamentos  !== undefined) resultado.orcamentos  = salvarTabela('orcamentos',  body.orcamentos);
      if (body.categorias  !== undefined) resultado.categorias  = salvarTabela('categorias',  body.categorias);
      payload = { resultado };
      
    } else if (action === 'upsert') {
      // Inserir/atualizar um único registro
      const { tabela, registro } = body;
      payload = upsertRegistro(tabela, registro);
      
    } else if (action === 'delete') {
      // Excluir um único registro pelo id
      const { tabela, id } = body;
      payload = deletarRegistro(tabela, id);
      
    } else if (action === 'load') {
      // Carregar dados via POST (útil para evitar CORS em alguns casos)
      payload = carregarTudo();
    }
    
    return responderJSON({ success: true, ...payload });
    
  } catch (err) {
    registrarLog('ERRO_POST', 'Sistema', err.message);
    return responderJSON({ success: false, error: err.message }, 500);
  }
}

// ── OPERAÇÕES DE LEITURA ──────────────────────────────────────

function carregarTudo() {
  return {
    financeiro : lerPlanilha('financeiro'),
    metas      : lerPlanilha('metas'),
    orcamentos : lerPlanilha('orcamentos'),
    categorias : lerPlanilha('categorias'),
    syncAt     : new Date().toISOString()
  };
}

function carregarTabela(tabela) {
  const dados = lerPlanilha(tabela);
  return { [tabela]: dados, syncAt: new Date().toISOString() };
}

function lerPlanilha(chave) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const nomePlan = PLANILHAS[chave];
  if (!nomePlan) return [];
  
  const sheet = ss.getSheetByName(nomePlan);
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return []; // Só cabeçalho ou vazia
  
  const headers = HEADERS[chave];
  const dados   = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  
  return dados
    .filter(row => row[0] !== '') // Ignorar linhas vazias
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        let val = row[i];
        // Converter tipos
        if (h === 'id' && val !== '') val = Number(val);
        if ((h === 'valor' || h === 'valorObjetivo' || h === 'valorAtual' || h === 'limite') && val !== '') val = Number(val);
        if (val instanceof Date) val = Utilities.formatDate(val, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        obj[h] = val;
      });
      return obj;
    });
}

// ── OPERAÇÕES DE ESCRITA ──────────────────────────────────────

function salvarTabela(chave, dados) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const nomePlan = PLANILHAS[chave];
  if (!nomePlan) return { erro: `Tabela '${chave}' inválida` };
  
  let sheet = ss.getSheetByName(nomePlan);
  if (!sheet) {
    sheet = ss.insertSheet(nomePlan);
  }
  
  const headers = HEADERS[chave];
  
  // Limpar dados existentes (manter cabeçalho)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }
  
  // Garantir cabeçalhos
  const cabRange = sheet.getRange(1, 1, 1, headers.length);
  cabRange.setValues([headers]);
  cabRange.setFontWeight('bold');
  cabRange.setBackground('#667eea');
  cabRange.setFontColor('#ffffff');
  sheet.setFrozenRows(1);
  
  // Inserir novos dados
  if (dados && dados.length > 0) {
    const rows = dados.map(item => headers.map(h => item[h] !== undefined ? item[h] : ''));
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    
    // Formatação condicional para planilha financeiro
    if (chave === 'financeiro') {
      aplicarFormatacaoFinanceiro(sheet, dados.length);
    }
  }
  
  registrarLog('SAVE', 'Apps Script', `${chave}: ${dados ? dados.length : 0} registros`);
  return { registros: dados ? dados.length : 0 };
}

function upsertRegistro(chave, registro) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const nomePlan = PLANILHAS[chave];
  const sheet    = ss.getSheetByName(nomePlan);
  const headers  = HEADERS[chave];
  if (!sheet || !headers) return { erro: 'Tabela inválida' };
  
  const lastRow  = sheet.getLastRow();
  const idCol    = 1; // Coluna A = id
  
  // Buscar linha pelo id
  let linhaEncontrada = -1;
  if (lastRow > 1) {
    const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues().flat();
    const idx = ids.findIndex(v => String(v) === String(registro.id));
    if (idx !== -1) linhaEncontrada = idx + 2; // +2 = cabeçalho + índice base 1
  }
  
  const rowData = headers.map(h => registro[h] !== undefined ? registro[h] : '');
  
  if (linhaEncontrada > 0) {
    // Atualizar
    sheet.getRange(linhaEncontrada, 1, 1, headers.length).setValues([rowData]);
    registrarLog('UPDATE', 'PWA', `${chave} id=${registro.id}`);
    return { acao: 'atualizado', id: registro.id };
  } else {
    // Inserir
    sheet.appendRow(rowData);
    registrarLog('INSERT', 'PWA', `${chave} id=${registro.id}`);
    return { acao: 'inserido', id: registro.id };
  }
}

function deletarRegistro(chave, id) {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const nomePlan = PLANILHAS[chave];
  const sheet    = ss.getSheetByName(nomePlan);
  if (!sheet) return { erro: 'Tabela inválida' };
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { erro: 'Tabela vazia' };
  
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues().flat();
  const idx = ids.findIndex(v => String(v) === String(id));
  
  if (idx === -1) return { erro: `ID ${id} não encontrado` };
  
  sheet.deleteRow(idx + 2);
  registrarLog('DELETE', 'PWA', `${chave} id=${id}`);
  return { acao: 'excluido', id };
}

// ── FORMATAÇÃO VISUAL ─────────────────────────────────────────

function aplicarFormatacaoFinanceiro(sheet, qtd) {
  if (qtd <= 0) return;
  
  // Coluna Valor: formato moeda
  sheet.getRange(2, 5, qtd, 1).setNumberFormat('R$ #,##0.00');
  
  // Coluna Data: formato data
  sheet.getRange(2, 6, qtd, 1).setNumberFormat('dd/MM/yyyy');
  
  // Formatação condicional por tipo (coluna B = tipo)
  const regras = SpreadsheetApp.newConditionalFormatRule;
  const tipoRange = sheet.getRange(`B2:B${qtd + 1}`);
  
  const formatacoes = [
    { valor: 'Pago',      cor: '#f8d7da', texto: '#721c24' },
    { valor: 'Pagar',     cor: '#fff3cd', texto: '#856404' },
    { valor: 'Recebido',  cor: '#d4edda', texto: '#155724' },
    { valor: 'Receber',   cor: '#d1ecf1', texto: '#0c5460' }
  ];
  
  const novasRegras = formatacoes.map(f =>
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(f.valor)
      .setBackground(f.cor)
      .setFontColor(f.texto)
      .setRanges([tipoRange])
      .build()
  );
  
  sheet.setConditionalFormatRules(novasRegras);
}

// ── ESTATÍSTICAS ──────────────────────────────────────────────

function gerarEstatisticas() {
  const fin     = lerPlanilha('financeiro');
  const hoje    = new Date();
  const mesAtual= `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
  
  const doMes = fin.filter(f => String(f.data).substring(0,7) === mesAtual);
  
  const totalPago     = doMes.filter(f=>f.tipo==='Pago').reduce((s,f)=>s+(+f.valor),0);
  const totalRecebido = doMes.filter(f=>f.tipo==='Recebido').reduce((s,f)=>s+(+f.valor),0);
  const totalPagar    = doMes.filter(f=>f.tipo==='Pagar').reduce((s,f)=>s+(+f.valor),0);
  const totalReceber  = doMes.filter(f=>f.tipo==='Receber').reduce((s,f)=>s+(+f.valor),0);
  
  return {
    stats: {
      totalRegistros : fin.length,
      mesAtual       : mesAtual,
      totalPago      : totalPago,
      totalRecebido  : totalRecebido,
      totalPagar     : totalPagar,
      totalReceber   : totalReceber,
      saldo          : totalRecebido - totalPago
    }
  };
}

// ── LOG ───────────────────────────────────────────────────────

function registrarLog(acao, origem, detalhes) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(PLANILHAS.log);
    
    if (!sheet) {
      sheet = ss.insertSheet(PLANILHAS.log);
      sheet.getRange(1,1,1,4).setValues([HEADERS.log]);
      sheet.getRange(1,1,1,4).setFontWeight('bold').setBackground('#343a40').setFontColor('#fff');
    }
    
    const ts = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm:ss');
    sheet.appendRow([ts, acao, origem, detalhes]);
    
    // Manter apenas os últimos 500 logs
    const lastRow = sheet.getLastRow();
    if (lastRow > 501) {
      sheet.deleteRows(2, lastRow - 501);
    }
  } catch (_) {
    // Silencioso — não deixar falha de log quebrar a operação principal
  }
}

function limparLog() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(PLANILHAS.log);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
  SpreadsheetApp.getUi().alert('✅ Log limpo!');
}

// ── GATILHO AUTOMÁTICO ────────────────────────────────────────
/**
 * Instalar com: configurarGatilhos()
 * Sincronização automática a cada hora
 */
function configurarGatilhos() {
  // Remover gatilhos existentes para evitar duplicatas
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  
  // Gatilho: ao abrir planilha
  ScriptApp.newTrigger('onOpen')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onOpen()
    .create();
  
  SpreadsheetApp.getUi().alert('✅ Gatilhos configurados!\n\nO menu "💰 Financeiro" aparecerá ao abrir a planilha.');
}

// ── UTILITÁRIOS ───────────────────────────────────────────────

function responderJSON(dados, status) {
  const output = ContentService
    .createTextOutput(JSON.stringify(dados))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ── TESTE LOCAL ───────────────────────────────────────────────
function testarScript() {
  Logger.log('=== TESTE DO SISTEMA FINANCEIRO ===');
  Logger.log('Spreadsheet ID: ' + SPREADSHEET_ID);
  
  // Configurar planilhas
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.entries(PLANILHAS).forEach(([chave, nome]) => {
    let sheet = ss.getSheetByName(nome);
    if (!sheet) {
      sheet = ss.insertSheet(nome);
      Logger.log('Criada: ' + nome);
    } else {
      Logger.log('Já existe: ' + nome);
    }
    const headers = HEADERS[chave];
    if (headers) {
      sheet.getRange(1,1,1,headers.length).setValues([headers]);
      sheet.getRange(1,1,1,headers.length).setFontWeight('bold').setBackground('#667eea').setFontColor('#fff');
      sheet.setFrozenRows(1);
    }
  });
  
  // Simular POST save
  const dadosTeste = {
    action: 'save',
    financeiro: [
      { id: 1, tipo:'Recebido', categoria:'Salário', descricao:'Salário Março', valor:5000, data:'2026-03-01', observacao:'', criacao:new Date().toISOString() },
      { id: 2, tipo:'Pago',     categoria:'Moradia',  descricao:'Aluguel',       valor:1500, data:'2026-03-05', observacao:'',     criacao:new Date().toISOString() },
      { id: 3, tipo:'Pago',     categoria:'Alimentação', descricao:'Supermercado', valor:800, data:'2026-03-10', observacao:'Mensal', criacao:new Date().toISOString() }
    ],
    metas: [
      { id: 1, titulo:'Reserva Emergência', valorObjetivo:10000, valorAtual:3500, prazo:'2026-12-31', descricao:'6 meses de despesas', criacao:new Date().toISOString() }
    ],
    orcamentos : [],
    categorias : []
  };
  
  if (dadosTeste.financeiro !== undefined)  salvarTabela('financeiro',  dadosTeste.financeiro);
  if (dadosTeste.metas      !== undefined)  salvarTabela('metas',       dadosTeste.metas);
  if (dadosTeste.orcamentos !== undefined)  salvarTabela('orcamentos',  dadosTeste.orcamentos);
  if (dadosTeste.categorias !== undefined)  salvarTabela('categorias',  dadosTeste.categorias);
  
  Logger.log('Dados de teste inseridos com sucesso!');
  
  // Simular GET load
  const leitura = carregarTudo();
  Logger.log('Financeiro lido: ' + leitura.financeiro.length + ' registros');
  Logger.log('Metas lidas: '     + leitura.metas.length      + ' registros');
  
  Logger.log('=== TESTE CONCLUÍDO ✅ ===');
  
  SpreadsheetApp.getUi().alert(
    '✅ Teste concluído com sucesso!\n\n' +
    'Verifique as planilhas:\n' +
    '• Financeiro: ' + leitura.financeiro.length + ' registros\n' +
    '• Metas: '      + leitura.metas.length      + ' registros\n\n' +
    'O script está funcionando corretamente!'
  );
}
