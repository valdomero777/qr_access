import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { validateQr } from '../../services/api';
import { cerrarSesionStaff } from '../../utils/session';
import { Box, Typography, Fab, Backdrop, CircularProgress } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CancelIcon from '@mui/icons-material/Cancel';

export default function ScannerView() {
  const [scanResult, setScanResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const scannerRef = useRef(null);
  // La guarda va en un ref, no en el estado: html5-qrcode registra el callback una
  // sola vez al montar, así que una lectura de `isProcessing` dentro de él queda
  // congelada en el valor del primer render (false) y no corta nunca. A 15 fps eso
  // dispara varias validaciones del mismo QR: la primera concede el acceso y las
  // siguientes responden "entrada ya utilizada", y el invitado legítimo ve la
  // pantalla roja. El estado se conserva sólo para pintar el Backdrop.
  const procesandoRef = useRef(false);
  const resetTimerRef = useRef(null);
  const navigate = useNavigate();

  const eventName = localStorage.getItem('eventName');
  const token = localStorage.getItem('staffToken');

  // La cámara sigue decodificando mientras se muestra el resultado, así que la
  // pausamos durante esos 2,5 s. Si no, un invitado que deje el código delante del
  // lector se lo re-escanea a sí mismo y acaba viendo "entrada ya utilizada".
  const pausarLector = (pausar) => {
    try {
      if (pausar) scannerRef.current?.pause(true);
      else scannerRef.current?.resume();
    } catch {
      // El lector puede no estar en un estado pausable (aún arrancando, o ya
      // limpiado al desmontar). La guarda del ref sigue protegiendo igualmente.
    }
  };

  const onScanSuccess = useCallback(async (decodedText) => {
    if (procesandoRef.current) return;
    procesandoRef.current = true;
    pausarLector(true);
    setIsProcessing(true);

    try {
      const response = await validateQr(decodedText, token);
      setScanResult({ success: response.status === 'success', message: response.message });
    } catch {
      setScanResult({ success: false, message: 'Error de red' });
    }

    resetTimerRef.current = setTimeout(() => {
      setScanResult(null);
      setIsProcessing(false);
      pausarLector(false);
      procesandoRef.current = false;
    }, 2500);
  }, [token]);

  useEffect(() => {
    if (!token) { navigate('/staff/login'); return; }

    scannerRef.current = new Html5QrcodeScanner(
      "reader",
      { fps: 15, qrbox: { width: 250, height: 250 } },
      false
    );

    scannerRef.current.render(onScanSuccess, () => {});

    return () => {
      clearTimeout(resetTimerRef.current);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(() => {});
      }
    };
  }, [token, navigate, onScanSuccess]);

  const handleLogout = () => {
    // Sólo la sesión de staff: un localStorage.clear() se llevaba por delante la
    // del administrador que estuviera probando el escáner en el mismo navegador.
    cerrarSesionStaff();
    navigate('/staff/login', { replace: true });
  };

  return (
    <Box sx={{ minHeight: '100vh', backgroundColor: '#000', position: 'relative' }}>
      
      {/* HEADER OPERATIVO */}
      <Box sx={{ 
        position: 'absolute', top: 0, width: '100%', zIndex: 10, p: 2,
        backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', textAlign: 'center' 
      }}>
        <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>ESCANEANDO PARA:</Typography>
        <Typography variant="h6" fontWeight="bold">{eventName}</Typography>
      </Box>

      {/* ÁREA DE CÁMARA */}
      <Box sx={{ 
        height: '100vh', display: 'flex', alignItems: 'center', 
        '& #reader': { border: 'none !important', width: '100%' },
        '& #reader__dashboard': { display: 'none' } // Oculta controles nativos feos
      }}>
        <div id="reader"></div>
      </Box>

      {/* BOTÓN FLOTANTE DE SALIDA */}
      <Fab 
        color="error" 
        size="medium" 
        onClick={handleLogout}
        sx={{ position: 'absolute', bottom: 20, right: 20 }}
      >
        <LogoutIcon />
      </Fab>

      {/* FEEDBACK VISUAL DE ESCANEO (Backdrop) */}
      <Backdrop
        sx={{ 
          zIndex: (theme) => theme.zIndex.drawer + 1, 
          flexDirection: 'column',
          backgroundColor: scanResult 
            ? (scanResult.success ? 'rgba(16, 185, 129, 0.95)' : 'rgba(239, 68, 68, 0.95)') 
            : 'rgba(0,0,0,0.7)'
        }}
        open={isProcessing}
      >
        {!scanResult ? (
          <>
            <CircularProgress color="inherit" size={60} />
            <Typography variant="h6" sx={{ color: 'white', mt: 2 }}>Validando...</Typography>
          </>
        ) : (
          <Box sx={{ textAlign: 'center', p: 3 }}>
            {scanResult.success ? <CheckCircleIcon sx={{ fontSize: 100, color: 'white' }} /> : <CancelIcon sx={{ fontSize: 100, color: 'white' }} />}
            <Typography variant="h4" sx={{ color: 'white', fontWeight: 'bold', mt: 2 }}>
              {scanResult.success ? 'ACCESO VÁLIDO' : 'ACCESO DENEGADO'}
            </Typography>
            <Typography variant="h6" sx={{ color: 'white', opacity: 0.9 }}>
              {scanResult.message}
            </Typography>
          </Box>
        )}
      </Backdrop>

    </Box>
  );
}