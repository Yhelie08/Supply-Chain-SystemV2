import { createElement } from 'react';
import {
  POScreen, ShipmentScreen, ReceivingScreen, ExceptionScreen, ReplacementScreen,
  GateScreen, PickScreen, PackQCPage, CrateScreen, AggregationScreen,
} from './pages/screens.jsx';
import { Dashboard, RulesScreen, ActivityScreen } from './pages/info.jsx';
import InquiryPage from './pages/inquiry/InquiryPage.jsx';
import PRPage from './pages/pr/PRPage.jsx';
import ForecastPage from './pages/forecast/ForecastPage.jsx';
import ProcurementDashboard from './pages/procurement/ProcurementDashboard.jsx';
import Placeholder from './pages/Placeholder.jsx';
import {
  FulfillmentDashboard, SalesOrderReport, PreOrder, ExceptionControl, TransferItem,
} from './pages/extras.jsx';
import {
  DeliveryAnalytics,
  TeamsScreen,
  InitialSchedulingScreen,
  ServiceRequestScreen,
  AppointmentScreen,
  OngoingScreen,
  ArchivedScreen as Archived,
  SiteVisitsScreen as SiteVisits,
  SalesReturnsScreen as SalesReturns,
  DmsExceptionScreen,
  TruckMaintenanceScreen as TruckMaintenance,
  ScheduleRequestsScreen as ScheduleRequests,
} from './pages/delivery/index.js';
import SupplierInquiries from './pages/supplier/InquiriesPage.jsx';

import SupplierPR from './pages/supplier/PRPage.jsx';
import SupplierPO from './pages/supplier/POPage.jsx';
import SupplierShipments from './pages/supplier/ShipmentsPage.jsx';
import SupplierRR from './pages/supplier/RRPage.jsx';
import { SECTIONS as SPEC, REFERENCE as SPEC_REFERENCE } from './live-spec.js';

// The menu is the live-spec data (src/live-spec.js) with a React component attached to each page.
// A page whose status is "placeholder" gets the Placeholder page instead of a component, so every tab the
// live app has exists here, and an unbuilt one says so.
const COMPONENTS = {
  Dashboard, ProcurementDashboard, InquiryPage, PRPage, POScreen, ShipmentScreen, ReceivingScreen, ReplacementScreen, ExceptionScreen, ForecastPage,
  GateScreen, PickScreen, PackQCPage, CrateScreen, AggregationScreen,
  TeamsScreen, InitialSchedulingScreen, ServiceRequestScreen, AppointmentScreen, OngoingScreen, DmsExceptionScreen,
  RulesScreen, ActivityScreen, FulfillmentDashboard, SalesOrderReport, PreOrder, ExceptionControl, TransferItem,
  DeliveryAnalytics, Archived, SiteVisits, SalesReturns, TruckMaintenance, ScheduleRequests, SupplierInquiries, SupplierPR, SupplierPO, SupplierShipments, SupplierRR,
};

function attach(page, section) {
  if (page.status === 'placeholder') {
    const Component = () => createElement(Placeholder, { spec: page });
    Component.displayName = `Placeholder(${page.label})`;
    return { ...page, Component };
  }
  const Page = COMPONENTS[page.component];
  if (!Page) throw new Error(`live-spec page "${page.label}" names component ${page.component}, which nav.js does not know.`);
  // A supplier portal page is one component for both portals, told which supplier it is showing.
  if (section.supplier) {
    const Component = () => createElement(Page, { supplier: section.supplier });
    Component.displayName = `${page.component}(${section.supplier})`;
    return { ...page, Component };
  }
  return { ...page, Component: Page };
}

// The dropdown: six sections, each with its row of page tabs.
export const SECTIONS = SPEC.map((s) => ({ ...s, pages: s.pages.map((p) => attach(p, s)) }));
// Reachable from the top bar, not from the dropdown.
export const REFERENCE = { ...SPEC_REFERENCE, pages: SPEC_REFERENCE.pages.map((p) => attach(p, SPEC_REFERENCE)) };

export const ROUTES = [...SECTIONS, REFERENCE].flatMap((s) => s.pages.map((p) => ({ ...p, section: s })));
export const FIRST_PATH = SECTIONS[0].pages[0].path;
