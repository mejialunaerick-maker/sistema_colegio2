// 1. Inicializar Mercado Pago con tu llave pública
const mp = new MercadoPago('TEST-4927163836376814-032014-9b2e2a050f2a417688274775276e033d-442058643', {
    locale: 'es-MX'
});

// --- FUNCIÓN: BUSCAR DATOS DEL ALUMNO ---
async function buscarAlumno() {
    const matriculaInput = document.getElementById('matricula');
    const matricula = matriculaInput.value.trim();
    const divResultado = document.getElementById('resultado');
    
    if (!matricula) {
        alert("Por favor, ingresa una matrícula.");
        return;
    }

    divResultado.innerHTML = `
        <p style='text-align:center;'>Buscando en UTAC...</p>
        <button onclick="location.reload()" style="margin: 10px auto; display: block; background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">
            🏠 Volver al Inicio
        </button>
    `;

    try {
        const response = await fetch(`/api/consulta/${matricula}`);
        const datos = await response.json();

        if (!datos || datos.length === 0) {
            divResultado.innerHTML = `
                <p style='color:red; text-align:center;'>Matrícula no encontrada.</p>
                <button onclick="location.reload()" style="margin: 10px auto; display: block; background: #6c757d; color: white; border: none; padding: 8px 15px; border-radius: 5px; cursor: pointer;">
                    Intentar de nuevo
                </button>
            `;
            return;
        }

        divResultado.innerHTML = ""; // Limpiar
        
        const btnVolver = document.createElement('button');
        btnVolver.innerText = "⬅️ Realizar otra búsqueda";
        btnVolver.style = "margin-bottom: 20px; width: 100%; background: #6c757d; color: white; border: none; padding: 10px; border-radius: 6px; cursor: pointer; font-weight: bold;";
        btnVolver.onclick = () => location.reload();
        divResultado.appendChild(btnVolver);

        datos.forEach(pago => {
            const card = document.createElement('div');
            card.className = 'pago-card';
            
            const esPagado = pago.estado_pago === 'pagado';
            const statusLabel = esPagado ? 'PAGADO' : 'PENDIENTE';
            const statusClass = esPagado ? 'status-pagado' : 'status-pendiente';
            
            card.innerHTML =` 
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong>${pago.nombre_concepto || 'Colegiatura'}</strong>
                    <span class="${statusClass}">${statusLabel}</span>
                </div>
                <p style="margin:5px 0;">Estudiante: ${(pago.nombre || 'Sin nombre').toUpperCase()}</p>
                <p style="margin:5px 0; color:#666;">Folio Interno: #UTAC-${pago.pago_id}</p>
            `;

            if (!esPagado) {
                const btnPagar = document.createElement('button');
                btnPagar.innerText = "PAGAR AHORA ($20.00 MXN)";
                btnPagar.className = "btn-pagar";
                btnPagar.onclick = () => iniciarPago(pago.pago_id, pago.nombre_concepto, 20);
                card.appendChild(btnPagar);
            } else {
                const btnPDF = document.createElement('button');
                btnPDF.innerText = "📄 DESCARGAR RECIBO (PDF)";
                btnPDF.className = "btn-pdf";
                btnPDF.onclick = () => descargarComprobante(pago);
                card.appendChild(btnPDF);
            }

            divResultado.appendChild(card);
        });

    } catch (error) {
        console.error("Error en búsqueda:", error);
        divResultado.innerHTML = "<p style='color:red;'>Error al conectar con el servidor.</p>";
    }
}

// --- FUNCIÓN: PROCESAR PAGO CON MERCADO PAGO ---
async function iniciarPago(pago_id, descripcion, precio) {
    try {
        const response = await fetch('/api/create_preference', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                pago_id: pago_id, 
                description: descripcion || "Pago de Colegiatura", 
                price: precio 
            })
        });

        const data = await response.json();

        if (data.id) {
            window.location.href = `https://www.mercadopago.com.mx/checkout/v1/redirect?pref_id=${data.id}`;
        } else {
            alert("No se pudo generar la orden de pago.");
        }
    } catch (err) {
        console.error("Error al crear preferencia:", err);
        alert("Error de red al intentar pagar.");
    }
}

// --- FUNCIÓN: GENERAR PDF INSTITUCIONAL ---
function descargarComprobante(pago) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const matriculaAlumno = document.getElementById('matricula').value;

    const rutaLogo = 'logo_utac.png'; 
    const rutaQR = 'codigoQR.jpg'; 

    const cargarImagen = (ruta) => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = ruta;
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error(`Error imagen: ${ruta}`));
        });
    };

    Promise.all([
        cargarImagen(rutaLogo).catch(() => null),
        cargarImagen(rutaQR).catch(() => null)
    ]).then(([logoImg, qrImg]) => {
        ejecutarDisenoPDF(doc, logoImg, qrImg, pago, matriculaAlumno);
    });
}

// --- FUNCIÓN AUXILIAR: DISEÑO Y MAQUETACIÓN DEL PDF CORREGIDO ---
function ejecutarDisenoPDF(doc, logoElement, qrElement, pago, matricula) {
    
    // 1. ENCABEZADO
    if (logoElement) {
        doc.addImage(logoElement, 'PNG', 20, 10, 25, 25); 
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 102, 0); 
    doc.text("UNIVERSIDAD TACANÁ", 110, 20, { align: "center" });

    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("Dirección Plantel Centro: 8a. Av Sur #54 Col. Centro Tapachula, Chiapas", 110, 30, { align: "center" });
    doc.text("Dirección Plantel Sur: 3a. Av Sur, Calzada del Zapatero, Los Naranjos Tapachula, Chiapas", 110, 35, { align: "center" });
    doc.text("Frente a Unidad Administrativa", 110, 39, { align: "center" });
    doc.text("Email: publicidad@utac.edu.mx | Tel: 962 625 5003 | (Lun - Dom 9:00 am - 6:00 pm)", 110, 44, { align: "center" });

    doc.setDrawColor(255, 102, 0);
    doc.setLineWidth(0.5);
    doc.line(20, 48, 190, 48); 

    // 2. DATOS DEL RECIBO
    doc.setTextColor(0);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("RECIBO OFICIAL DE PAGO", 105, 58, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const xPunto = 25;
    const yInicioDatos = 70;
    const espaciado = 8;

    doc.text(`Estudiante: ${pago.nombre.toUpperCase()}`, xPunto, yInicioDatos);
    doc.text(`Matrícula: ${matricula}`, xPunto, yInicioDatos + espaciado);
    doc.text(`Concepto: ${pago.nombre_concepto}`, xPunto, yInicioDatos + espaciado * 2);
    doc.setFont("helvetica", "bold");
    doc.text(`Estado: PAGADO`, xPunto, yInicioDatos + espaciado * 3);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha de Emisión: ${new Date().toLocaleDateString('es-MX')}`, xPunto, yInicioDatos + espaciado * 4);
    doc.text(`Folio Interno: #UTAC-${pago.pago_id}`, xPunto, yInicioDatos + espaciado * 5);

    // 3. SECCIÓN DE VALIDACIÓN (QR GRANDE + SELLO LADO A LADO)
    const centroY = 135; // Bajamos un poco la sección para que no choque con los datos
    
    // --- CÓDIGO QR GRANDE (40x40) ---
    if (qrElement) {
        doc.addImage(qrElement, 'JPEG', 45, centroY - 20, 40, 40); 
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text("ESCANEA PARA VALIDAR", 65, centroY + 25, { align: "center" });
    }

    // --- SELLO DE TESORERÍA ---
    const sX = 145, sY = centroY;
    doc.setDrawColor(255, 102, 0);
    doc.setLineWidth(1);
    doc.circle(sX, sY, 18); 
    doc.setFontSize(13);
    doc.setTextColor(255, 102, 0);
    doc.setFont("helvetica", "bold");
    doc.text("UTAC", sX, sY + 2, { align:"center" });
    doc.setFontSize(6);
    doc.text("DEPARTAMENTO", sX, sY + 8, { align: "center" });
    doc.text("DE TESORERÍA", sX, sY + 11, { align: "center" });

    // 4. PIE DE PÁGINA
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(20, 245, 190, 245); 

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7);
    doc.setTextColor(100);
    const textoValidez = "Este documento es una representación gráfica de un pago digital procesado a través de la plataforma autorizada de la Universidad Tacaná (UTAC). La validez de este recibo está sujeta a la liquidación efectiva de los fondos en la cuenta institucional. El folio interno es único e intransferible y sirve como comprobante oficial.";
    const lineasTexto = doc.splitTextToSize(textoValidez, 170); 
    doc.text(lineasTexto, 105, 252, { align: "center" });

    doc.setFont("courier", "bold");
    doc.setFontSize(8);
    doc.setTextColor(50);
    doc.text(`CADENA DIGITAL: UTAC-PAY-${pago.pago_id}-SDK-MP-${new Date().getTime()}`, 105, 272, { align: "center" });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(255, 102, 0); 
    doc.text('"JOVENES CONSTRUYENDO EL FUTURO DE LA 4 TRANSFORMACION"', 105, 282, { align: "center" });

    doc.save(`Recibo_Oficial_UTAC_${pago.pago_id}.pdf`);
}