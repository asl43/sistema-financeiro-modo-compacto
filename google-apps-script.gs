// ==================== GOOGLE APPS SCRIPT - SISTEMA FINANCEIRO ====================
// Este script permite sincronização bidirecional automática entre o HTML e Google Sheets
// 
// INSTRUÇÕES DE CONFIGURAÇÃO:
// 1. Abra seu Google Sheets
// 2. Vá em Extensões > Apps Script
// 3. Cole este código completo
// 4. Clique em "Implantar" > "Nova implantação"
// 5. Escolha "Aplicativo da Web"
// 6. Em "Executar como": escolha "Eu"
// 7. Em "Quem tem acesso": escolha "Qualquer pessoa"
// 8. Clique em "Implantar"
// 9. Copie a URL gerada e cole no sistema HTML
// 10. Autorize as permissões necessárias

// ==================== CONFIGURAÇÕES ====================
const CONFIG = {
  SHEET_NAMES: {
    FINANCEIRO: 'Financeiro',
    METAS: 'Metas',
    ORCAMENTOS: 'Orcamentos',
    CATEGORIAS: 'Categorias',
    LOG: 'Log_Sincronizacao'
  },
  
  HEADERS: {
    FINANCEIRO: ['ID', 'Tipo', 'Categoria', 'Descrição', 'Valor', 'Data', 'Observação', 'Data Criação'],
    METAS: ['ID', 'Título', 'Valor Objetivo', 'Valor Atual', 'Prazo', 'Descrição', 'Data Criação'],
    ORCAMENTOS: ['ID', 'Categoria', 'Limite', 'Mês'],
    CATEGORIAS: ['ID', 'Nome'],
    LOG: ['Data/Hora', 'Ação', 'Origem', 'Registros Afetados', 'Status', 'Detalhes']
  },
  
  AUTO_SYNC: {
    ENABLED: true,
    INTERVAL_MINUTES: 30 // Sincronizar automaticamente a cada 30 minutos
  }
};

// ==================== INICIALIZAÇÃO ====================
function inicializarPlanilhas() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Criar abas se não existirem
  Object.values(CONFIG.SHEET_NAMES).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      
      // Adicionar cabeçalhos
      const headers = CONFIG.HEADERS[sheetName.toUpperCase().replace('_', '')];
      if (headers) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        
        // Formatar cabeçalho
        sheet.getRange(1, 1, 1, headers.length)
          .setBackground('#667eea')
          .setFontColor('#ffffff')
          .setFontWeight('bold')
          .setHorizontalAlignment('center');
        
        // Congelar primeira linha
        sheet.setFrozenRows(1);
        
        // Auto-ajustar colunas
        for (let i = 1; i <= headers.length; i++) {
          sheet.autoResizeColumn(i);
        }
      }
    }
  });
  
  registrarLog('Inicialização', 'Sistema', 0, 'Sucesso', 'Planilhas criadas/verificadas');
  return 'Planilhas inicializadas com sucesso!';
}

// ==================== ENDPOINT PRINCIPAL ====================
function doGet(e) {
  try {
    const action = e.parameter.action || 'load';
    
    if (action === 'load') {
      return carregarDados();
    } else if (action === 'status') {
      return verificarStatus();
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      error: 'Ação não reconhecida',
      actions: ['load', 'status']
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    registrarLog('GET Request', 'API', 0, 'Erro', error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const dados = JSON.parse(e.postData.contents);
    const action = dados.action || 'save';
    
    if (action === 'save') {
      return salvarDados(dados);
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: 'Ação não reconhecida'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    registrarLog('POST Request', 'API', 0, 'Erro', error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== CARREGAR DADOS ====================
function carregarDados() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const resultado = {
      financeiro: carregarAba(ss, CONFIG.SHEET_NAMES.FINANCEIRO, CONFIG.HEADERS.FINANCEIRO),
      metas: carregarAba(ss, CONFIG.SHEET_NAMES.METAS, CONFIG.HEADERS.METAS),
      orcamentos: carregarAba(ss, CONFIG.SHEET_NAMES.ORCAMENTOS, CONFIG.HEADERS.ORCAMENTOS),
      categorias: carregarAba(ss, CONFIG.SHEET_NAMES.CATEGORIAS, CONFIG.HEADERS.CATEGORIAS),
      timestamp: new Date().toISOString()
    };
    
    const totalRegistros = 
      resultado.financeiro.length + 
      resultado.metas.length + 
      resultado.orcamentos.length + 
      resultado.categorias.length;
    
    registrarLog('Carregamento', 'API', totalRegistros, 'Sucesso', 'Dados enviados ao cliente');
    
    return ContentService.createTextOutput(JSON.stringify(resultado))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    registrarLog('Carregamento', 'API', 0, 'Erro', error.toString());
    throw error;
  }
}

function carregarAba(ss, sheetName, headers) {
  const sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return [];
  }
  
  const lastRow = sheet.getLastRow();
  
  if (lastRow <= 1) {
    return [];
  }
  
  const data = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  
  return data.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      const key = header.toLowerCase().replace(/ /g, '').replace(/\//g, '');
      let value = row[index];
      
      // Converter datas
      if (header.includes('Data') || header === 'Prazo' || header === 'Mês') {
        if (value instanceof Date) {
          value = Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
      }
      
      // Converter números
      if (header.includes('Valor') || header === 'Limite' || header === 'ID') {
        value = Number(value) || 0;
      }
      
      obj[key] = value;
    });
    return obj;
  }).filter(obj => obj.id); // Filtrar linhas vazias
}

// ==================== SALVAR DADOS ====================
function salvarDados(dados) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let totalRegistros = 0;
    
    // Salvar cada tipo de dado
    if (dados.financeiro) {
      salvarAba(ss, CONFIG.SHEET_NAMES.FINANCEIRO, CONFIG.HEADERS.FINANCEIRO, dados.financeiro);
      totalRegistros += dados.financeiro.length;
    }
    
    if (dados.metas) {
      salvarAba(ss, CONFIG.SHEET_NAMES.METAS, CONFIG.HEADERS.METAS, dados.metas);
      totalRegistros += dados.metas.length;
    }
    
    if (dados.orcamentos) {
      salvarAba(ss, CONFIG.SHEET_NAMES.ORCAMENTOS, CONFIG.HEADERS.ORCAMENTOS, dados.orcamentos);
      totalRegistros += dados.orcamentos.length;
    }
    
    if (dados.categorias) {
      salvarAba(ss, CONFIG.SHEET_NAMES.CATEGORIAS, CONFIG.HEADERS.CATEGORIAS, dados.categorias);
      totalRegistros += dados.categorias.length;
    }
    
    registrarLog('Salvamento', 'API', totalRegistros, 'Sucesso', 'Dados recebidos e salvos');
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Dados salvos com sucesso!',
      registros: totalRegistros,
      timestamp: new Date().toISOString()
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    registrarLog('Salvamento', 'API', 0, 'Erro', error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function salvarAba(ss, sheetName, headers, dados) {
  let sheet = ss.getSheetByName(sheetName);
  
  // Criar aba se não existir
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    formatarCabecalho(sheet, headers.length);
  }
  
  // Limpar dados antigos (manter cabeçalho)
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }
  
  // Inserir novos dados
  if (dados && dados.length > 0) {
    const rows = dados.map(item => {
      return headers.map(header => {
        const key = header.toLowerCase().replace(/ /g, '').replace(/\//g, '');
        let value = item[key];
        
        // Formatar datas
        if ((header.includes('Data') || header === 'Prazo' || header === 'Mês') && value) {
          if (typeof value === 'string') {
            value = new Date(value);
          }
        }
        
        return value !== undefined ? value : '';
      });
    });
    
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
    
    // Formatar colunas de valor como moeda
    headers.forEach((header, index) => {
      if (header.includes('Valor') || header === 'Limite') {
        const colIndex = index + 1;
        sheet.getRange(2, colIndex, rows.length, 1).setNumberFormat('R$ #,##0.00');
      }
    });
    
    // Auto-ajustar colunas
    for (let i = 1; i <= headers.length; i++) {
      sheet.autoResizeColumn(i);
    }
  }
}

function formatarCabecalho(sheet, numColunas) {
  sheet.getRange(1, 1, 1, numColunas)
    .setBackground('#667eea')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');
  
  sheet.setFrozenRows(1);
}

// ==================== LOG DE SINCRONIZAÇÃO ====================
function registrarLog(acao, origem, registros, status, detalhes) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEET_NAMES.LOG);
    
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEET_NAMES.LOG);
      sheet.getRange(1, 1, 1, CONFIG.HEADERS.LOG.length)
        .setValues([CONFIG.HEADERS.LOG]);
      formatarCabecalho(sheet, CONFIG.HEADERS.LOG.length);
    }
    
    const dataHora = new Date();
    const novaLinha = [
      dataHora,
      acao,
      origem,
      registros,
      status,
      detalhes
    ];
    
    sheet.appendRow(novaLinha);
    
    // Formatar última linha
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1).setNumberFormat('dd/mm/yyyy hh:mm:ss');
    
    // Colorir por status
    const corStatus = status === 'Sucesso' ? '#d4edda' : 
                     status === 'Erro' ? '#f8d7da' : '#fff3cd';
    sheet.getRange(lastRow, 1, 1, CONFIG.HEADERS.LOG.length)
      .setBackground(corStatus);
    
    // Manter apenas últimos 1000 registros
    if (lastRow > 1001) {
      sheet.deleteRows(2, lastRow - 1001);
    }
    
  } catch (error) {
    console.error('Erro ao registrar log:', error);
  }
}

// ==================== VERIFICAR STATUS ====================
function verificarStatus() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const status = {
      planilha: ss.getName(),
      url: ss.getUrl(),
      abas: {},
      ultimaAtualizacao: new Date().toISOString(),
      configuracoes: {
        autoSync: CONFIG.AUTO_SYNC.ENABLED,
        intervalo: CONFIG.AUTO_SYNC.INTERVAL_MINUTES + ' minutos'
      }
    };
    
    // Verificar cada aba
    Object.entries(CONFIG.SHEET_NAMES).forEach(([key, sheetName]) => {
      const sheet = ss.getSheetByName(sheetName);
      status.abas[sheetName] = {
        existe: sheet !== null,
        registros: sheet ? sheet.getLastRow() - 1 : 0
      };
    });
    
    return ContentService.createTextOutput(JSON.stringify(status))
      .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ==================== SINCRONIZAÇÃO AUTOMÁTICA ====================
// Esta função pode ser configurada para rodar automaticamente via Triggers
function sincronizacaoAutomatica() {
  try {
    registrarLog('Sincronização Automática', 'Trigger', 0, 'Sucesso', 'Execução programada');
    
    // Aqui você pode adicionar lógica adicional se necessário
    // Por exemplo, enviar notificações, backup automático, etc.
    
    return 'Sincronização automática executada';
    
  } catch (error) {
    registrarLog('Sincronização Automática', 'Trigger', 0, 'Erro', error.toString());
    throw error;
  }
}

// ==================== CONFIGURAR TRIGGER AUTOMÁTICO ====================
// Execute esta função UMA VEZ para criar o trigger de sincronização automática
function configurarTriggerAutomatico() {
  try {
    // Remover triggers existentes
    const triggers = ScriptApp.getProjectTriggers();
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'sincronizacaoAutomatica') {
        ScriptApp.deleteTrigger(trigger);
      }
    });
    
    // Criar novo trigger
    if (CONFIG.AUTO_SYNC.ENABLED) {
      ScriptApp.newTrigger('sincronizacaoAutomatica')
        .timeBased()
        .everyMinutes(CONFIG.AUTO_SYNC.INTERVAL_MINUTES)
        .create();
      
      registrarLog('Configuração Trigger', 'Sistema', 1, 'Sucesso', 
        'Trigger automático configurado para ' + CONFIG.AUTO_SYNC.INTERVAL_MINUTES + ' minutos');
      
      return 'Trigger automático configurado com sucesso!';
    } else {
      return 'Sincronização automática está desabilitada';
    }
    
  } catch (error) {
    registrarLog('Configuração Trigger', 'Sistema', 0, 'Erro', error.toString());
    throw error;
  }
}

// ==================== REMOVER TRIGGER AUTOMÁTICO ====================
function removerTriggerAutomatico() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    let removidos = 0;
    
    triggers.forEach(trigger => {
      if (trigger.getHandlerFunction() === 'sincronizacaoAutomatica') {
        ScriptApp.deleteTrigger(trigger);
        removidos++;
      }
    });
    
    registrarLog('Remoção Trigger', 'Sistema', removidos, 'Sucesso', 
      removidos + ' trigger(s) removido(s)');
    
    return 'Triggers automáticos removidos: ' + removidos;
    
  } catch (error) {
    registrarLog('Remoção Trigger', 'Sistema', 0, 'Erro', error.toString());
    throw error;
  }
}

// ==================== BACKUP AUTOMÁTICO ====================
function criarBackupAutomatico() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const data = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmmss');
    const nomeBackup = 'Backup_' + ss.getName() + '_' + data;
    
    // Criar cópia da planilha
    const backup = ss.copy(nomeBackup);
    
    registrarLog('Backup', 'Sistema', 1, 'Sucesso', 
      'Backup criado: ' + nomeBackup);
    
    return {
      success: true,
      nome: nomeBackup,
      url: backup.getUrl()
    };
    
  } catch (error) {
    registrarLog('Backup', 'Sistema', 0, 'Erro', error.toString());
    throw error;
  }
}

// ==================== EXPORTAR DADOS COMO JSON ====================
function exportarComoJSON() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    const dados = {
      financeiro: carregarAba(ss, CONFIG.SHEET_NAMES.FINANCEIRO, CONFIG.HEADERS.FINANCEIRO),
      metas: carregarAba(ss, CONFIG.SHEET_NAMES.METAS, CONFIG.HEADERS.METAS),
      orcamentos: carregarAba(ss, CONFIG.SHEET_NAMES.ORCAMENTOS, CONFIG.HEADERS.ORCAMENTOS),
      categorias: carregarAba(ss, CONFIG.SHEET_NAMES.CATEGORIAS, CONFIG.HEADERS.CATEGORIAS),
      dataExportacao: new Date().toISOString()
    };
    
    const json = JSON.stringify(dados, null, 2);
    
    registrarLog('Exportação JSON', 'Sistema', 
      dados.financeiro.length + dados.metas.length + 
      dados.orcamentos.length + dados.categorias.length, 
      'Sucesso', 'Dados exportados como JSON');
    
    return json;
    
  } catch (error) {
    registrarLog('Exportação JSON', 'Sistema', 0, 'Erro', error.toString());
    throw error;
  }
}

// ==================== IMPORTAR DADOS DE JSON ====================
function importarDeJSON(jsonString) {
  try {
    const dados = JSON.parse(jsonString);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    let totalRegistros = 0;
    
    if (dados.financeiro) {
      salvarAba(ss, CONFIG.SHEET_NAMES.FINANCEIRO, CONFIG.HEADERS.FINANCEIRO, dados.financeiro);
      totalRegistros += dados.financeiro.length;
    }
    
    if (dados.metas) {
      salvarAba(ss, CONFIG.SHEET_NAMES.METAS, CONFIG.HEADERS.METAS, dados.metas);
      totalRegistros += dados.metas.length;
    }
    
    if (dados.orcamentos) {
      salvarAba(ss, CONFIG.SHEET_NAMES.ORCAMENTOS, CONFIG.HEADERS.ORCAMENTOS, dados.orcamentos);
      totalRegistros += dados.orcamentos.length;
    }
    
    if (dados.categorias) {
      salvarAba(ss, CONFIG.SHEET_NAMES.CATEGORIAS, CONFIG.HEADERS.CATEGORIAS, dados.categorias);
      totalRegistros += dados.categorias.length;
    }
    
    registrarLog('Importação JSON', 'Sistema', totalRegistros, 'Sucesso', 
      'Dados importados de JSON');
    
    return 'Importação concluída! ' + totalRegistros + ' registros importados.';
    
  } catch (error) {
    registrarLog('Importação JSON', 'Sistema', 0, 'Erro', error.toString());
    throw error;
  }
}

// ==================== LIMPAR TODOS OS DADOS ====================
function limparTodosDados() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let totalLimpezas = 0;
    
    Object.values(CONFIG.SHEET_NAMES).forEach(sheetName => {
      const sheet = ss.getSheetByName(sheetName);
      if (sheet && sheetName !== CONFIG.SHEET_NAMES.LOG) {
        const lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
          totalLimpezas++;
        }
      }
    });
    
    registrarLog('Limpeza', 'Sistema', totalLimpezas, 'Sucesso', 
      totalLimpezas + ' aba(s) limpa(s)');
    
    return 'Dados limpos com sucesso! ' + totalLimpezas + ' abas afetadas.';
    
  } catch (error) {
    registrarLog('Limpeza', 'Sistema', 0, 'Erro', error.toString());
    throw error;
  }
}

// ==================== MENU PERSONALIZADO ====================
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  
  ui.createMenu('💰 Sistema Financeiro')
    .addItem('📥 Carregar Dados do HTML', 'menuCarregarDados')
    .addItem('📤 Exportar como JSON', 'menuExportarJSON')
    .addSeparator()
    .addItem('⚙️ Inicializar Planilhas', 'menuInicializar')
    .addItem('🔄 Configurar Sincronização Automática', 'menuConfigurarTrigger')
    .addItem('⏹️ Desativar Sincronização Automática', 'menuRemoverTrigger')
    .addSeparator()
    .addItem('💾 Criar Backup', 'menuBackup')
    .addItem('🗑️ Limpar Dados', 'menuLimpar')
    .addSeparator()
    .addItem('📊 Ver Status', 'menuStatus')
    .addToUi();
}

// Funções do menu
function menuCarregarDados() {
  const ui = SpreadsheetApp.getUi();
  ui.alert('Use o botão "Carregar do Sheet" no sistema HTML para sincronizar os dados.');
}

function menuExportarJSON() {
  const json = exportarComoJSON();
  const ui = SpreadsheetApp.getUi();
  ui.alert('JSON gerado! Copie do Logger (Ctrl+Enter para abrir)');
  Logger.log(json);
}

function menuInicializar() {
  const resultado = inicializarPlanilhas();
  SpreadsheetApp.getUi().alert(resultado);
}

function menuConfigurarTrigger() {
  const resultado = configurarTriggerAutomatico();
  SpreadsheetApp.getUi().alert(resultado);
}

function menuRemoverTrigger() {
  const resultado = removerTriggerAutomatico();
  SpreadsheetApp.getUi().alert(resultado);
}

function menuBackup() {
  const resultado = criarBackupAutomatico();
  SpreadsheetApp.getUi().alert('Backup criado: ' + resultado.nome + '\n\nURL: ' + resultado.url);
}

function menuLimpar() {
  const ui = SpreadsheetApp.getUi();
  const resposta = ui.alert('Atenção!', 
    'Deseja realmente limpar todos os dados? Esta ação não pode ser desfeita!', 
    ui.ButtonSet.YES_NO);
  
  if (resposta === ui.Button.YES) {
    const resultado = limparTodosDados();
    ui.alert(resultado);
  }
}

function menuStatus() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let mensagem = 'STATUS DO SISTEMA\n\n';
  mensagem += 'Planilha: ' + ss.getName() + '\n\n';
  
  Object.entries(CONFIG.SHEET_NAMES).forEach(([key, sheetName]) => {
    const sheet = ss.getSheetByName(sheetName);
    const registros = sheet ? sheet.getLastRow() - 1 : 0;
    mensagem += sheetName + ': ' + registros + ' registros\n';
  });
  
  SpreadsheetApp.getUi().alert(mensagem);
}
